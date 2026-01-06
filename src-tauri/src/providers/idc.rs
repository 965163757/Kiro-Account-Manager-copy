// IdC Provider - BuilderId/Enterprise 登录
// 使用设备授权流程 (Device Authorization Flow)

use crate::aws_sso_client::{AWSSSOClient, DevicePollResult};
use crate::browser::open_browser;
use sha2::{Digest, Sha256};
use super::{AuthResult, AuthProvider, RefreshMetadata};
use async_trait::async_trait;
use std::time::Duration;

const BUILDER_ID_START_URL: &str = "https://view.awsapps.com/start";

pub struct IdcProvider {
    provider_id: String,
    region: String,
    start_url: Option<String>,
}

impl IdcProvider {
    pub fn new(provider_id: &str, region: &str, start_url: Option<String>) -> Self {
        Self {
            provider_id: provider_id.to_string(),
            region: region.to_string(),
            start_url,
        }
    }

    /// 获取 start URL
    fn get_start_url(&self) -> &str {
        self.start_url.as_deref().unwrap_or(BUILDER_ID_START_URL)
    }

    /// 计算 clientIdHash
    fn compute_client_id_hash(start_url: &str) -> String {
        let mut hasher = Sha256::new();
        hasher.update(start_url.as_bytes());
        let hash = hasher.finalize();
        hex::encode(hash)
    }
}

#[async_trait]
impl AuthProvider for IdcProvider {
    async fn login(&self) -> Result<AuthResult, String> {
        let provider = &self.provider_id;
        let region = &self.region;
        let start_url = self.get_start_url();

        println!("\n[IdC] Starting {} authentication (Device Flow)...", provider);
        println!("Region: {}", region);
        println!("Start URL: {}", start_url);

        // Step 1: 创建 AWS SSO 客户端
        let sso_client = AWSSSOClient::new(region);

        // Step 2: 注册支持设备授权的客户端
        println!("[IdC] Registering device client...");
        let client_reg = sso_client.register_device_client(start_url).await?;
        println!("Client ID: {}", client_reg.client_id);

        // Step 3: 发起设备授权
        println!("[IdC] Starting device authorization...");
        let device_auth = sso_client.start_device_authorization(
            &client_reg.client_id,
            &client_reg.client_secret,
            start_url,
        ).await?;
        
        println!("[IdC] User Code: {}", device_auth.user_code);
        println!("[IdC] Verification URI: {}", device_auth.verification_uri);

        // Step 4: 打开浏览器让用户输入 user_code
        let verification_url = device_auth.verification_uri_complete
            .as_ref()
            .unwrap_or(&device_auth.verification_uri);
        println!("[IdC] Opening browser: {}", verification_url);
        open_browser(verification_url)?;

        // Step 5: 轮询等待用户授权
        println!("[IdC] Waiting for user authorization...");
        let mut interval = device_auth.interval.unwrap_or(5) as u64;
        let timeout = std::time::Instant::now() + Duration::from_secs(device_auth.expires_in as u64);

        let token_response = loop {
            if std::time::Instant::now() > timeout {
                return Err("设备授权超时，请重试".to_string());
            }

            tokio::time::sleep(Duration::from_secs(interval)).await;

            match sso_client.poll_device_token(
                &client_reg.client_id,
                &client_reg.client_secret,
                &device_auth.device_code,
            ).await? {
                DevicePollResult::Success(token) => {
                    println!("[IdC] Authorization successful!");
                    break token;
                }
                DevicePollResult::Pending => {
                    // 继续轮询
                    continue;
                }
                DevicePollResult::SlowDown => {
                    // 增加轮询间隔
                    interval += 5;
                    continue;
                }
                DevicePollResult::Expired => {
                    return Err("设备码已过期，请重试".to_string());
                }
                DevicePollResult::Denied => {
                    return Err("用户拒绝授权".to_string());
                }
            }
        };

        // Step 6: 构建 AuthResult
        let expires_at = chrono::Local::now() + chrono::Duration::seconds(token_response.expires_in);
        let client_id_hash = Self::compute_client_id_hash(start_url);

        println!("[IdC] {} login successful! {}", provider, serde_json::to_string_pretty(&serde_json::json!({
            "expiresIn": token_response.expires_in,
            "expiresAt": expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            "hasIdToken": token_response.id_token.is_some(),
            "hasSsoSessionId": token_response.aws_sso_app_session_id.is_some(),
        })).unwrap_or_default());

        Ok(AuthResult {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_at: expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            provider: provider.clone(),
            auth_method: "IdC".to_string(),
            id_token: token_response.id_token,
            token_type: token_response.token_type,
            expires_in: token_response.expires_in,
            region: Some(region.clone()),
            client_id: Some(client_reg.client_id),
            client_secret: Some(client_reg.client_secret),
            client_id_hash: Some(client_id_hash),
            sso_session_id: token_response.aws_sso_app_session_id,
            profile_arn: None,
            csrf_token: None,
            session_token: None,
        })
    }

    async fn refresh_token(&self, refresh_token: &str, metadata: RefreshMetadata) -> Result<AuthResult, String> {
        // IdC 刷新需要 client_id 和 client_secret
        let client_id = metadata.client_id.ok_or("Client ID is required for IdC token refresh")?;
        let client_secret = metadata.client_secret.ok_or("Client secret is required for IdC token refresh")?;
        let region = metadata.region.as_deref().unwrap_or(&self.region);

        let sso_client = AWSSSOClient::new(region);
        let token_response = sso_client.refresh_token(&client_id, &client_secret, refresh_token).await?;

        let expires_at = chrono::Local::now() + chrono::Duration::seconds(token_response.expires_in);
        let client_id_hash = metadata.client_id_hash.unwrap_or_else(|| Self::compute_client_id_hash(self.get_start_url()));

        Ok(AuthResult {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_at: expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            provider: self.provider_id.clone(),
            auth_method: "IdC".to_string(),
            id_token: token_response.id_token,
            token_type: token_response.token_type,
            expires_in: token_response.expires_in,
            region: Some(region.to_string()),
            client_id: Some(client_id),
            client_secret: Some(client_secret),
            client_id_hash: Some(client_id_hash),
            sso_session_id: token_response.aws_sso_app_session_id,
            profile_arn: None,
            csrf_token: None,
            session_token: None,
        })
    }

    fn get_provider_id(&self) -> &str {
        &self.provider_id
    }

    fn get_auth_method(&self) -> &str {
        "IdC"
    }
}
