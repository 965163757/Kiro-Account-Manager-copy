// Auth 相关命令 - 直接存储 usage_data

use tauri::{Emitter, State};
use serde::Serialize;
use crate::state::AppState;
use crate::account::Account;
use crate::auth::{User, get_usage_limits_desktop};
use crate::auth_social;
use crate::codewhisperer_client::CodeWhispererClient;
use crate::providers::{AuthMethod, AuthProvider, get_provider_config, create_social_provider, create_idc_provider};
use crate::kiro::get_machine_id;
use crate::aws_sso_client::AWSSSOClient;

/// 设备授权信息（用于自动注册）
#[derive(Debug, Serialize)]
pub struct DeviceAuthInfo {
    pub verification_uri: String,
    pub verification_uri_complete: Option<String>,
    pub user_code: String,
    pub device_code: String,
    pub client_id: String,
    pub client_secret: String,
    pub expires_in: i64,
    pub interval: i64,
}

#[tauri::command]
pub fn get_current_user(state: State<AppState>) -> Option<User> {
    state.auth.user.lock().unwrap().clone()
}

#[tauri::command]
pub fn logout(state: State<AppState>) {
    use crate::state::CURRENT_DEVICE_AUTH_URL;

    *state.auth.user.lock().unwrap() = None;
    *state.auth.csrf_token.lock().unwrap() = None;
    *state.auth.access_token.lock().unwrap() = None;
    *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
}

#[tauri::command]
pub async fn kiro_login(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    provider: String,
) -> Result<String, String> {
    let config = get_provider_config(&provider)
        .ok_or_else(|| format!("Unsupported provider: {}", provider))?;

    match config.auth_method {
        AuthMethod::Social => login_social(app_handle, state, &config).await,
        AuthMethod::Idc => login_idc(app_handle, state, &config).await,
    }
}

async fn login_social(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: &crate::providers::ProviderConfig,
) -> Result<String, String> {
    let social_provider = create_social_provider(config);
    let provider_id = social_provider.get_provider_id().to_string();
    let auth_method = social_provider.get_auth_method();
    
    let auth_result = social_provider.login().await?;
    
    // 获取 usage，失败不影响登录（账号可能被暂停但仍可保存）
    let usage = get_usage_limits_desktop(&auth_result.access_token).await.ok();
    let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);

    // 优先从 usage 获取 email，否则用默认值
    let email = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.email.clone())
        .unwrap_or_else(|| format!("user@{}.social", provider_id.to_lowercase()));
    let user_id = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.user_id.clone());

    let mut store = state.store.lock().unwrap();
    
    // 按 email + provider 去重
    let account = if let Some(existing) = store.accounts.iter_mut().find(|a| a.email == email && a.provider.as_deref() == Some(&provider_id)) {
        // 更新现有账号
        existing.access_token = Some(auth_result.access_token.clone());
        existing.refresh_token = Some(auth_result.refresh_token.clone());
        existing.user_id = user_id;
        existing.expires_at = Some(auth_result.expires_at.clone());
        existing.profile_arn = auth_result.profile_arn;
        existing.label = format!("Kiro {} 账号", provider_id);
        // 不覆盖 csrfToken，保留 Web OAuth 的
        existing.usage_data = Some(usage_data);
        existing.status = "正常".to_string();
        existing.clone()
    } else {
        // 新建账号
        let mut account = Account::new(email.clone(), format!("Kiro {} 账号", provider_id));
        account.access_token = Some(auth_result.access_token.clone());
        account.refresh_token = Some(auth_result.refresh_token.clone());
        account.provider = Some(provider_id.clone());
        account.user_id = user_id;
        account.expires_at = Some(auth_result.expires_at.clone());
        account.profile_arn = auth_result.profile_arn;
        account.csrf_token = auth_result.csrf_token;
        account.usage_data = Some(usage_data);
        store.accounts.insert(0, account.clone());
        account
    };
    
    store.save_to_file();
    drop(store);

    update_auth_state(&state, &email, &provider_id, &auth_result.access_token, &auth_result.refresh_token);
    println!("\n[{}] LOGIN SUCCESS: {}", auth_method, account.email);

    let _ = app_handle.emit("login-success", account.id.clone());
    Ok(format!("{} login completed for {}", auth_method, provider_id))
}

async fn login_idc(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    config: &crate::providers::ProviderConfig,
) -> Result<String, String> {
    let idc_provider = create_idc_provider(config);
    let provider_id = idc_provider.get_provider_id().to_string();
    let auth_method = idc_provider.get_auth_method();
    
    let auth_result = idc_provider.login().await?;

    let machine_id = get_machine_id();
    let cw_client = CodeWhispererClient::new(&machine_id);
    let usage_call = cw_client.get_usage_limits(&auth_result.access_token).await;
    let (usage, is_banned) = match &usage_call {
        Ok(u) => (Some(u.clone()), false),
        Err(e) if e.starts_with("BANNED:") => (None, true),
        Err(_) => (None, false),
    };
    let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);

    let email = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.email.clone())
        .unwrap_or_else(|| "user@builder.id".to_string());
    let user_id = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.user_id.clone());

    let mut store = state.store.lock().unwrap();
    
    // 按 email + provider 去重
    let account = if let Some(existing) = store.accounts.iter_mut().find(|a| a.email == email && a.provider.as_deref() == Some(&provider_id)) {
        existing.access_token = Some(auth_result.access_token.clone());
        existing.refresh_token = Some(auth_result.refresh_token.clone());
        existing.user_id = user_id;
        existing.expires_at = Some(auth_result.expires_at.clone());
        existing.client_id_hash = auth_result.client_id_hash;
        existing.client_id = auth_result.client_id;
        existing.client_secret = auth_result.client_secret;
        existing.region = auth_result.region;
        existing.sso_session_id = auth_result.sso_session_id;
        existing.id_token = auth_result.id_token;
        existing.profile_arn = auth_result.profile_arn;
        existing.usage_data = Some(usage_data);
        existing.status = if is_banned { "已封禁".to_string() } else { "正常".to_string() };
        existing.clone()
    } else {
        let mut account = Account::new(email.clone(), format!("Kiro {} 账号", provider_id));
        account.access_token = Some(auth_result.access_token.clone());
        account.refresh_token = Some(auth_result.refresh_token.clone());
        account.provider = Some(provider_id.clone());
        account.user_id = user_id;
        account.expires_at = Some(auth_result.expires_at.clone());
        account.client_id_hash = auth_result.client_id_hash;
        account.client_id = auth_result.client_id;
        account.client_secret = auth_result.client_secret;
        account.region = auth_result.region;
        account.sso_session_id = auth_result.sso_session_id;
        account.id_token = auth_result.id_token;
        account.profile_arn = auth_result.profile_arn;
        account.usage_data = Some(usage_data);
        account.status = if is_banned { "已封禁".to_string() } else { "正常".to_string() };
        store.accounts.insert(0, account.clone());
        account
    };
    
    store.save_to_file();
    drop(store);

    update_auth_state(&state, &email, &provider_id, &auth_result.access_token, &auth_result.refresh_token);
    println!("\n[{}] LOGIN SUCCESS: {}", auth_method, account.email);

    let _ = app_handle.emit("login-success", account.id.clone());
    Ok(format!("{} login completed for {}", auth_method, email))
}

fn update_auth_state(state: &State<'_, AppState>, email: &str, provider: &str, access_token: &str, refresh_token: &str) {
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
    *state.pending_login.lock().unwrap() = None;
}

#[tauri::command]
pub async fn handle_kiro_social_callback(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    code: String,
    callback_state: String,
) -> Result<(), String> {
    let pending = {
        let lock = state.pending_login.lock().unwrap();
        lock.clone().ok_or("No pending login found")?
    };
    
    if pending.state != callback_state {
        return Err("State mismatch".to_string());
    }
    
    let redirect_uri = "kiro://app/callback";
    let token_response = auth_social::exchange_social_code_for_token(
        &code, &pending.code_verifier, redirect_uri, &pending.machineid,
    ).await?;
    
    let usage = get_usage_limits_desktop(&token_response.access_token).await.ok();
    let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);
    
    let email = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.email.clone())
        .unwrap_or_else(|| format!("user@{}.com", pending.provider.to_lowercase()));
    let user_id = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.user_id.clone());

    let mut store = state.store.lock().unwrap();
    
    let account = if let Some(existing) = store.accounts.iter_mut().find(|a| a.email == email) {
        existing.access_token = Some(token_response.access_token.clone());
        existing.refresh_token = Some(token_response.refresh_token.clone());
        existing.provider = Some(pending.provider.clone());
        existing.user_id = user_id;
        existing.usage_data = Some(usage_data);
        existing.status = "正常".to_string();
        existing.clone()
    } else {
        let mut account = Account::new(email.clone(), format!("Kiro {} 账号", pending.provider));
        account.access_token = Some(token_response.access_token.clone());
        account.refresh_token = Some(token_response.refresh_token.clone());
        account.provider = Some(pending.provider.clone());
        account.user_id = user_id;
        account.usage_data = Some(usage_data);
        store.accounts.insert(0, account.clone());
        account
    };
    
    store.save_to_file();
    drop(store);
    
    update_auth_state(&state, &email, &pending.provider, &token_response.access_token, &token_response.refresh_token);
    let _ = app_handle.emit("login-success", account.id);
    println!("Social callback login completed: {}", email);
    Ok(())
}

#[tauri::command]
pub async fn add_kiro_account(
    state: State<'_, AppState>,
    email: String,
    access_token: String,
    refresh_token: String,
    csrf_token: String,
    idp: String,
    _quota: Option<i32>,
    _used: Option<i32>,
) -> Result<Account, String> {
    println!("Adding Kiro account: email={}, idp={}", email, idp);
    
    let usage = if !access_token.is_empty() {
        get_usage_limits_desktop(&access_token).await.ok()
    } else {
        None
    };
    let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);
    
    let final_email = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.email.clone())
        .unwrap_or(email.clone());
    let user_id = usage.as_ref()
        .and_then(|u| u.user_info.as_ref())
        .and_then(|ui| ui.user_id.clone());

    *state.auth.access_token.lock().unwrap() = Some(access_token.clone());
    *state.auth.refresh_token.lock().unwrap() = Some(refresh_token.clone());
    *state.auth.csrf_token.lock().unwrap() = Some(csrf_token.clone());
    
    let user = User {
        id: uuid::Uuid::new_v4().to_string(),
        email: final_email.clone(),
        name: final_email.split('@').next().unwrap_or("User").to_string(),
        avatar: None,
        provider: idp.clone(),
    };
    *state.auth.user.lock().unwrap() = Some(user);
    *state.pending_login.lock().unwrap() = None;
    
    let mut store = state.store.lock().unwrap();
    
    let account = if let Some(existing) = store.accounts.iter_mut().find(|a| a.email == final_email) {
        existing.access_token = Some(access_token);
        existing.refresh_token = Some(refresh_token);
        existing.provider = Some(idp);
        existing.user_id = user_id;
        existing.csrf_token = Some(csrf_token);
        existing.usage_data = Some(usage_data);
        existing.status = "正常".to_string();
        existing.clone()
    } else {
        let mut account = Account::new(final_email.clone(), format!("Kiro {} 账号", idp));
        account.access_token = Some(access_token);
        account.refresh_token = Some(refresh_token);
        account.provider = Some(idp);
        account.user_id = user_id;
        account.csrf_token = Some(csrf_token);
        account.usage_data = Some(usage_data);
        store.accounts.insert(0, account.clone());
        account
    };
    
    store.save_to_file();
    
    Ok(account)
}

#[tauri::command]
pub fn get_supported_providers() -> Vec<&'static str> {
    crate::providers::get_supported_providers()
}

/// 清除设备授权 URL（用于取消登录或超时）
#[tauri::command]
pub fn clear_device_auth_url() {
    use crate::state::CURRENT_DEVICE_AUTH_URL;
    *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
}


/// 获取 BuilderId 设备授权 URL（不打开浏览器，不轮询）
/// 用于自动注册脚本
#[tauri::command]
pub async fn get_device_auth_url(region: Option<String>) -> Result<DeviceAuthInfo, String> {
    use crate::state::CURRENT_DEVICE_AUTH_URL;
    
    let region = region.as_deref().unwrap_or("us-east-1");
    let start_url = "https://view.awsapps.com/start";
    
    println!("[DeviceAuth] Getting device auth URL (region: {})", region);
    
    let sso_client = AWSSSOClient::new(region);
    
    // Step 1: 注册客户端
    let client_reg = sso_client.register_device_client(start_url).await?;
    println!("[DeviceAuth] Client registered: {}", &client_reg.client_id);
    
    // Step 2: 发起设备授权
    let device_auth = sso_client.start_device_authorization(
        &client_reg.client_id,
        &client_reg.client_secret,
        start_url,
    ).await?;
    
    let url = device_auth.verification_uri_complete.clone()
        .unwrap_or_else(|| device_auth.verification_uri.clone());
    
    println!("[DeviceAuth] URL: {}", url);
    println!("[DeviceAuth] User Code: {}", device_auth.user_code);
    
    // 更新全局状态，供 HTTP 服务使用
    *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = Some(url);
    
    Ok(DeviceAuthInfo {
        verification_uri: device_auth.verification_uri,
        verification_uri_complete: device_auth.verification_uri_complete,
        user_code: device_auth.user_code,
        device_code: device_auth.device_code,
        client_id: client_reg.client_id,
        client_secret: client_reg.client_secret,
        expires_in: device_auth.expires_in,
        interval: device_auth.interval.unwrap_or(5),
    })
}

/// 使用 device_code 轮询获取 token（配合 get_device_auth_url 使用）
#[tauri::command]
pub async fn poll_device_auth(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    device_code: String,
    client_id: String,
    client_secret: String,
    region: Option<String>,
) -> Result<String, String> {
    use crate::aws_sso_client::DevicePollResult;
    use crate::state::CURRENT_DEVICE_AUTH_URL;
    use sha2::{Digest, Sha256};
    
    let region = region.as_deref().unwrap_or("us-east-1");
    let start_url = "https://view.awsapps.com/start";
    
    let sso_client = AWSSSOClient::new(region);
    
    // 单次轮询
    match sso_client.poll_device_token(&client_id, &client_secret, &device_code).await? {
        DevicePollResult::Success(token) => {
            println!("[DeviceAuth] Authorization successful!");
            
            // 清除全局 URL
            *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
            
            // 计算 client_id_hash
            let mut hasher = Sha256::new();
            hasher.update(start_url.as_bytes());
            let client_id_hash = hex::encode(hasher.finalize());
            
            // 获取用户信息
            let machine_id = get_machine_id();
            let cw_client = CodeWhispererClient::new(&machine_id);
            let usage = cw_client.get_usage_limits(&token.access_token).await.ok();
            let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);
            
            let email = usage.as_ref()
                .and_then(|u| u.user_info.as_ref())
                .and_then(|ui| ui.email.clone())
                .unwrap_or_else(|| "user@builder.id".to_string());
            let user_id = usage.as_ref()
                .and_then(|u| u.user_info.as_ref())
                .and_then(|ui| ui.user_id.clone());
            
            let expires_at = chrono::Local::now() + chrono::Duration::seconds(token.expires_in);
            
            // 保存账号
            let mut store = state.store.lock().unwrap();
            let account = if let Some(existing) = store.accounts.iter_mut()
                .find(|a| a.email == email && a.provider.as_deref() == Some("BuilderId")) 
            {
                existing.access_token = Some(token.access_token.clone());
                existing.refresh_token = Some(token.refresh_token.clone());
                existing.user_id = user_id;
                existing.expires_at = Some(expires_at.format("%Y/%m/%d %H:%M:%S").to_string());
                existing.client_id_hash = Some(client_id_hash);
                existing.client_id = Some(client_id);
                existing.client_secret = Some(client_secret);
                existing.region = Some(region.to_string());
                existing.sso_session_id = token.aws_sso_app_session_id;
                existing.id_token = token.id_token;
                existing.usage_data = Some(usage_data);
                existing.status = "正常".to_string();
                existing.clone()
            } else {
                let mut account = Account::new(email.clone(), "Kiro BuilderId 账号".to_string());
                account.access_token = Some(token.access_token.clone());
                account.refresh_token = Some(token.refresh_token.clone());
                account.provider = Some("BuilderId".to_string());
                account.user_id = user_id;
                account.expires_at = Some(expires_at.format("%Y/%m/%d %H:%M:%S").to_string());
                account.client_id_hash = Some(client_id_hash);
                account.client_id = Some(client_id);
                account.client_secret = Some(client_secret);
                account.region = Some(region.to_string());
                account.sso_session_id = token.aws_sso_app_session_id;
                account.id_token = token.id_token;
                account.usage_data = Some(usage_data);
                store.accounts.insert(0, account.clone());
                account
            };
            
            store.save_to_file();
            drop(store);
            
            let _ = app_handle.emit("login-success", account.id.clone());
            Ok(format!("success:{}", email))
        }
        DevicePollResult::Pending => Ok("pending".to_string()),
        DevicePollResult::SlowDown => Ok("slow_down".to_string()),
        DevicePollResult::Expired => {
            *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
            Err("expired".to_string())
        }
        DevicePollResult::Denied => {
            *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
            Err("denied".to_string())
        }
    }
}
