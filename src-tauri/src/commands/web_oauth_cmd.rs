// Web OAuth 命令 - 直接存储 usage_data

use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder};
use crate::state::AppState;
use crate::account::Account;
use crate::auth::User;
use crate::providers::web_oauth::{WebOAuthProvider, WebOAuthInitResult};

static PENDING_LOGIN: OnceLock<Mutex<Option<WebOAuthInitResult>>> = OnceLock::new();

fn get_pending_login() -> &'static Mutex<Option<WebOAuthInitResult>> {
    PENDING_LOGIN.get_or_init(|| Mutex::new(None))
}

#[tauri::command]
pub async fn web_oauth_initiate(provider: String) -> Result<WebOAuthInitResponse, String> {
    println!("\n========== web_oauth_initiate START ==========");
    println!("Provider: {}", provider);
    
    if provider != "Google" && provider != "Github" {
        return Err(format!("Unsupported provider: {}. Use 'Google' or 'Github'", provider));
    }

    let web_provider = WebOAuthProvider::new(&provider);
    
    match web_provider.initiate_login().await {
        Ok(init_result) => {
            println!("Authorize URL: {}", init_result.authorize_url);
            println!("State: {}", init_result.state);
            
            let response = WebOAuthInitResponse {
                authorize_url: init_result.authorize_url.clone(),
                state: init_result.state.clone(),
            };
            
            *get_pending_login().lock().unwrap() = Some(init_result);
            println!("========== web_oauth_initiate SUCCESS ==========\n");
            
            Ok(response)
        },
        Err(e) => {
            println!("initiate_login FAILED: {}", e);
            Err(e)
        }
    }
}

#[derive(serde::Serialize)]
pub struct WebOAuthInitResponse {
    pub authorize_url: String,
    pub state: String,
}

#[tauri::command]
pub async fn web_oauth_complete(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    callback_url: String,
) -> Result<String, String> {
    println!("[WebOAuth] web_oauth_complete: callback_url={}", &callback_url[..80.min(callback_url.len())]);
    
    let url = url::Url::parse(&callback_url)
        .map_err(|e| format!("Invalid callback URL: {}", e))?;
    
    let code = url.query_pairs()
        .find(|(k, _)| k == "code")
        .map(|(_, v)| v.to_string())
        .ok_or("No 'code' parameter in callback URL")?;
    
    let returned_state = url.query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string())
        .ok_or("No 'state' parameter in callback URL")?;
    
    let init_result = {
        let mut pending_guard = get_pending_login().lock().unwrap();
        pending_guard.take()
    }.ok_or("No pending authentication state found")?;
    
    let web_provider = WebOAuthProvider::new(&init_result.provider_id);
    let auth_result = web_provider.complete_login(
        &code,
        &returned_state,
        &init_result.code_verifier,
        &init_result.state,
    ).await?;

    let csrf_token = auth_result.csrf_token.as_ref()
        .ok_or("No csrf_token from ExchangeToken")?;
    let refresh_token = &auth_result.refresh_token;

    let portal_client = crate::providers::web_oauth::KiroWebPortalClient::new();
    let user_info = portal_client.get_user_info(
        &auth_result.access_token,
        csrf_token,
        refresh_token,
        &init_result.idp,
    ).await?;

    let provider = &init_result.provider_id;
    let email = user_info.email.clone()
        .ok_or("No email in GetUserInfo response")?;
    let user_id = user_info.user_id.clone();

    let usage = portal_client.get_user_usage_and_limits(
        &auth_result.access_token,
        csrf_token,
        refresh_token,
        &init_result.idp,
    ).await?;
    let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);

    let mut store = state.store.lock().unwrap();
    
    let account = if let Some(existing) = store.accounts.iter_mut().find(|a| a.email == email) {
        // 更新现有账号
        existing.access_token = Some(auth_result.access_token.clone());
        existing.refresh_token = Some(auth_result.refresh_token.clone());
        existing.provider = Some(provider.clone());
        existing.user_id = user_id;
        existing.expires_at = Some(auth_result.expires_at.clone());
        existing.profile_arn = auth_result.profile_arn.clone();
        existing.csrf_token = auth_result.csrf_token.clone();
        existing.usage_data = Some(usage_data);
        existing.status = "正常".to_string();
        existing.clone()
    } else {
        // 新建账号
        let mut account = Account::new(email.clone(), format!("Kiro {} (Web OAuth)", provider));
        account.access_token = Some(auth_result.access_token.clone());
        account.refresh_token = Some(auth_result.refresh_token.clone());
        account.provider = Some(provider.clone());
        account.user_id = user_id;
        account.expires_at = Some(auth_result.expires_at.clone());
        account.profile_arn = auth_result.profile_arn.clone();
        account.csrf_token = auth_result.csrf_token.clone();
        account.usage_data = Some(usage_data);
        store.accounts.insert(0, account.clone());
        account
    };
    
    store.save_to_file();
    drop(store);

    update_auth_state_web(&state, &email, provider, &auth_result.access_token, &auth_result.refresh_token);
    println!("[WebOAuth] LOGIN SUCCESS: email={}, provider={}", account.email, provider);

    let _ = app_handle.emit("login-success", account.id.clone());
    Ok(format!("Web OAuth login completed for {}", provider))
}

#[tauri::command]
pub async fn web_oauth_refresh(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<Account, String> {
    let account = {
        let store = state.store.lock().unwrap();
        store.accounts.iter()
            .find(|a| a.id == account_id)
            .cloned()
            .ok_or("Account not found")?
    };

    // Web OAuth 账号必须有 csrfToken
    if account.csrf_token.is_none() {
        return Err("This account is not a Web OAuth account (no csrfToken)".to_string());
    }

    let access_token = account.access_token.as_ref().ok_or("No access_token found")?;
    let csrf_token = account.csrf_token.as_ref().ok_or("No csrf_token found")?;
    let provider = account.provider.as_ref().ok_or("No provider found")?;
    
    let refresh_token = account.refresh_token.as_ref().ok_or("No refresh_token found")?;
    let web_provider = WebOAuthProvider::new(provider);
    let auth_result = web_provider.refresh_token_impl(access_token, csrf_token, refresh_token).await?;

    let new_csrf = auth_result.csrf_token.clone();
    
    let portal_client = crate::providers::web_oauth::KiroWebPortalClient::new();
    let idp = match provider.as_str() {
        "Github" => "Github",
        other => other,
    };
    let usage = portal_client.get_user_usage_and_limits(
        &auth_result.access_token,
        new_csrf.as_deref().unwrap_or(""),
        refresh_token,
        idp,
    ).await.ok();
    let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);

    let mut store = state.store.lock().unwrap();
    if let Some(a) = store.accounts.iter_mut().find(|a| a.id == account_id) {
        a.access_token = Some(auth_result.access_token);
        a.refresh_token = Some(auth_result.refresh_token);
        a.csrf_token = auth_result.csrf_token;
        a.expires_at = Some(auth_result.expires_at);
        a.usage_data = Some(usage_data);
        a.status = "正常".to_string();
        if auth_result.profile_arn.is_some() {
            a.profile_arn = auth_result.profile_arn;
        }
        
        let result = a.clone();
        store.save_to_file();
        println!("[WebOAuth] Account refreshed: {}", result.email);
        return Ok(result);
    }

    Err("Account not found after refresh".to_string())
}

fn update_auth_state_web(
    state: &State<'_, AppState>,
    email: &str,
    provider: &str,
    access_token: &str,
    refresh_token: &str,
) {
    let user = User {
        id: uuid::Uuid::new_v4().to_string(),
        email: email.to_string(),
        name: email.split('@').next().unwrap_or("User").to_string(),
        avatar: None,
        provider: provider.to_string(),
    };
    *state.auth.user.lock().unwrap() = Some(user);
    *state.auth.access_token.lock().unwrap() = Some(access_token.to_string());
    *state.auth.refresh_token.lock().unwrap() = Some(refresh_token.to_string());
}

#[tauri::command]
pub async fn web_oauth_login(
    app_handle: AppHandle,
    provider: String,
) -> Result<WebOAuthLoginResponse, String> {
    println!("\n========== web_oauth_login START ==========");
    println!("Provider: {}", provider);
    
    if provider != "Google" && provider != "Github" {
        return Err(format!("Unsupported provider: {}. Use 'Google' or 'Github'", provider));
    }

    let web_provider = WebOAuthProvider::new(&provider);
    let init_result = web_provider.initiate_login().await?;
    
    println!("Authorize URL: {}", init_result.authorize_url);
    println!("State: {}", init_result.state);
    
    *get_pending_login().lock().unwrap() = Some(init_result.clone());
    println!("Saved init_result to PENDING_LOGIN, state: {}", init_result.state);
    
    let window_label = format!("oauth_{}", provider.to_lowercase());
    
    if let Some(existing) = app_handle.get_webview_window(&window_label) {
        let _ = existing.close();
    }
    
    let app_handle_clone = app_handle.clone();
    let window_label_clone = window_label.clone();
    
    let _window = WebviewWindowBuilder::new(
        &app_handle,
        &window_label,
        WebviewUrl::External(init_result.authorize_url.parse().unwrap())
    )
    .title(format!("Login with {}", provider))
    .inner_size(500.0, 700.0)
    .center()
    .incognito(true)
    .on_navigation(move |url| {
        let url_str = url.as_str();
        println!("[WebView] Navigation: {}", url_str);
        
        if url_str.starts_with("https://app.kiro.dev/signin/oauth") && url_str.contains("code=") {
            println!("[WebView] Callback URL detected! Emitting event...");
            let _ = app_handle_clone.emit("web-oauth-callback", url_str.to_string());
            
            if let Some(win) = app_handle_clone.get_webview_window(&window_label_clone) {
                let _ = win.close();
            }
            return false;
        }
        true
    })
    .build()
    .map_err(|e| format!("Failed to create auth window: {}", e))?;
    
    println!("========== web_oauth_login WINDOW OPENED ==========\n");
    
    Ok(WebOAuthLoginResponse {
        window_label,
        state: init_result.state,
    })
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WebOAuthLoginResponse {
    pub window_label: String,
    pub state: String,
}

#[tauri::command]
pub fn web_oauth_close_window(
    app_handle: AppHandle,
    window_label: String,
) -> Result<(), String> {
    if let Some(window) = app_handle.get_webview_window(&window_label) {
        window.close().map_err(|e| format!("Failed to close window: {}", e))?;
    }
    Ok(())
}
