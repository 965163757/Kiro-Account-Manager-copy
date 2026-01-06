// Social Provider - Google/Github 登录
// 参考 kiro-batch-login/src/providers/social-provider.js

use crate::kiro_auth_client::KiroAuthServiceClient;
use crate::deep_link_handler::{DeepLinkCallbackWaiter, register_waiter};
use crate::auth_social;
use super::{AuthResult, AuthProvider, RefreshMetadata};
use serde::Deserialize;
use async_trait::async_trait;

/// Social 登录 Token 响应
#[derive(Debug, Deserialize)]
struct SocialTokenResponse {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
    #[serde(rename = "profileArn")]
    profile_arn: Option<String>,
    #[serde(rename = "expiresIn")]
    expires_in: i64,
    #[serde(rename = "idToken")]
    id_token: Option<String>,
    #[serde(rename = "tokenType")]
    token_type: Option<String>,
    #[serde(rename = "csrfToken")]
    csrf_token: Option<String>,
}

/// Social 刷新 Token 响应
#[derive(Debug, Deserialize)]
struct SocialRefreshResponse {
    #[serde(rename = "accessToken")]
    access_token: String,
    #[serde(rename = "refreshToken")]
    refresh_token: String,
    #[serde(rename = "profileArn")]
    profile_arn: Option<String>,
    #[serde(rename = "expiresIn")]
    expires_in: i64,
    #[serde(rename = "csrfToken")]
    csrf_token: Option<String>,
}

pub struct SocialProvider {
    provider_id: String,
}

impl SocialProvider {
    pub fn new(provider_id: &str) -> Self {
        Self {
            provider_id: provider_id.to_string(),
        }
    }
}

#[async_trait]
impl AuthProvider for SocialProvider {
    async fn login(&self) -> Result<AuthResult, String> {
        let provider = &self.provider_id;

        // Step 1: 使用 deep link 作为回调 URI
        let redirect_uri = DeepLinkCallbackWaiter::get_redirect_uri();

        // Step 2: 生成 PKCE 参数
        let state = uuid::Uuid::new_v4().to_string();
        let code_verifier = auth_social::generate_code_verifier_social();
        let code_challenge = auth_social::generate_code_challenge_social(&code_verifier);

        println!("\n[Social] Starting {} authentication...", provider);
        println!("Redirect URI: {}", redirect_uri);
        println!("State: {}", state);

        // Step 3: 注册回调等待器
        let waiter = register_waiter(&state);

        // Step 4: 打开浏览器登录
        let client = KiroAuthServiceClient::new();
        client.login(provider, &redirect_uri, &code_challenge, &state).await?;

        // Step 5: 等待 deep link 回调
        println!("[Social] Waiting for deep link callback...");
        let callback = tokio::task::spawn_blocking(move || waiter.wait_for_callback())
            .await
            .map_err(|e| format!("Failed to join callback waiter: {}", e))?
            .map_err(|e| format!("OAuth callback failed: {}", e))?;
        
        println!("[Social] Callback received, state: {}", callback.state);

        // Step 6: 交换 token
        println!("[Social] Exchanging code for tokens...");
        let token_response: SocialTokenResponse = client
            .create_token(&callback.code, &code_verifier, &redirect_uri, None)
            .await?;

        // Step 7: 构建 AuthResult
        let expires_at = chrono::Local::now() + chrono::Duration::seconds(token_response.expires_in);

        println!("[Social] {} login successful! {}", provider, serde_json::to_string_pretty(&serde_json::json!({
            "expiresIn": token_response.expires_in,
            "expiresAt": expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            "hasIdToken": token_response.id_token.is_some(),
            "hasProfileArn": token_response.profile_arn.is_some(),
        })).unwrap_or_default());

        Ok(AuthResult {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_at: expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            provider: provider.clone(),
            auth_method: "social".to_string(),
            id_token: token_response.id_token,
            token_type: token_response.token_type,
            expires_in: token_response.expires_in,
            region: None,
            client_id: None,
            client_secret: None,
            client_id_hash: None,
            sso_session_id: None,
            profile_arn: token_response.profile_arn,
            csrf_token: token_response.csrf_token,
            session_token: None,
        })
    }

    async fn refresh_token(&self, refresh_token: &str, metadata: RefreshMetadata) -> Result<AuthResult, String> {
        let client = KiroAuthServiceClient::new();
        let token_response: SocialRefreshResponse = client.refresh_token(refresh_token).await?;

        let expires_at = chrono::Local::now() + chrono::Duration::seconds(token_response.expires_in);

        Ok(AuthResult {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_at: expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            provider: self.provider_id.clone(),
            auth_method: "social".to_string(),
            id_token: None,
            token_type: Some("Bearer".to_string()),
            expires_in: token_response.expires_in,
            region: None,
            client_id: None,
            client_secret: None,
            client_id_hash: None,
            sso_session_id: None,
            profile_arn: metadata.profile_arn.or(token_response.profile_arn),
            csrf_token: token_response.csrf_token,
            session_token: None,
        })
    }

    fn get_provider_id(&self) -> &str {
        &self.provider_id
    }

    fn get_auth_method(&self) -> &str {
        "social"
    }
}
