/// AWS SSO OIDC Client
/// 实现 AWS SSO OIDC API 调用，用于 BuilderId 认证

use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::proxy_utils::create_http_client;

/// AWS SSO OIDC 客户端
pub struct AWSSSOClient {
    region: String,
    base_url: String,
    client: Client,
}

/// 客户端注册响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientRegistration {
    #[serde(rename = "clientId")]
    pub client_id: String,
    #[serde(rename = "clientSecret")]
    pub client_secret: String,
    #[serde(rename = "clientIdIssuedAt")]
    pub client_id_issued_at: Option<i64>,
    #[serde(rename = "clientSecretExpiresAt")]
    pub client_secret_expires_at: Option<i64>,
    #[serde(rename = "authorizationEndpoint")]
    pub authorization_endpoint: Option<String>,
    #[serde(rename = "tokenEndpoint")]
    pub token_endpoint: Option<String>,
}

/// Token 响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenResponse {
    #[serde(rename = "accessToken")]
    pub access_token: String,
    #[serde(rename = "refreshToken")]
    pub refresh_token: String,
    #[serde(rename = "idToken")]
    pub id_token: Option<String>,
    #[serde(rename = "tokenType")]
    pub token_type: Option<String>,
    #[serde(rename = "expiresIn")]
    pub expires_in: i64,
    #[serde(rename = "aws_sso_app_session_id")]
    pub aws_sso_app_session_id: Option<String>,
    #[serde(rename = "issuedTokenType")]
    pub issued_token_type: Option<String>,
    #[serde(rename = "originSessionId")]
    pub origin_session_id: Option<String>,
}

impl AWSSSOClient {
    pub fn new(region: &str) -> Self {
        let base_url = format!("https://oidc.{}.amazonaws.com", region);
        let client = create_http_client();

        Self {
            region: region.to_string(),
            base_url,
            client,
        }
    }

    /// 刷新 Token（Builder ID 账号刷新时使用）
    pub async fn refresh_token(
        &self,
        client_id: &str,
        client_secret: &str,
        refresh_token: &str,
    ) -> Result<TokenResponse, String> {
        let url = format!("{}/token", self.base_url);

        let body = serde_json::json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "grantType": "refresh_token",
            "refreshToken": refresh_token
        });

        println!("\n[AWS SSO] Refresh Token");

        let resp = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Token refresh request failed: {}", e))?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            if status.as_u16() == 401 {
                return Err("RefreshToken 已过期或无效".to_string());
            }
            return Err(format!("Token refresh failed ({}): {}", status, text));
        }

        println!("Token refreshed successfully");

        serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse token response: {}", e))
    }

    /// 注册支持设备授权的客户端
    pub async fn register_device_client(&self, issuer_url: &str) -> Result<ClientRegistration, String> {
        let url = format!("{}/client/register", self.base_url);
        
        let body = serde_json::json!({
            "clientName": "Kiro Account Manager",
            "clientType": "public",
            "scopes": [
                "codewhisperer:completions",
                "codewhisperer:analysis",
                "codewhisperer:conversations",
                "codewhisperer:transformations",
                "codewhisperer:taskassist"
            ],
            "grantTypes": ["urn:ietf:params:oauth:grant-type:device_code", "refresh_token"],
            "issuerUrl": issuer_url
        });

        println!("\n[AWS SSO] Register Device Client (region: {})", self.region);

        let resp = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Device client registration failed: {}", e))?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!("Device client registration failed ({}): {}", status, text));
        }

        println!("Device client registered successfully");
        serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse client registration: {}", e))
    }

    /// 发起设备授权请求
    pub async fn start_device_authorization(
        &self,
        client_id: &str,
        client_secret: &str,
        start_url: &str,
    ) -> Result<DeviceAuthorizationResponse, String> {
        let url = format!("{}/device_authorization", self.base_url);

        let body = serde_json::json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "startUrl": start_url
        });

        println!("\n[AWS SSO] Start Device Authorization");

        let resp = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Device authorization failed: {}", e))?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if !status.is_success() {
            return Err(format!("Device authorization failed ({}): {}", status, text));
        }

        println!("Device authorization started");
        serde_json::from_str(&text)
            .map_err(|e| format!("Failed to parse device authorization: {}", e))
    }

    /// 轮询设备授权状态获取 Token
    pub async fn poll_device_token(
        &self,
        client_id: &str,
        client_secret: &str,
        device_code: &str,
    ) -> Result<DevicePollResult, String> {
        let url = format!("{}/token", self.base_url);

        let body = serde_json::json!({
            "clientId": client_id,
            "clientSecret": client_secret,
            "grantType": "urn:ietf:params:oauth:grant-type:device_code",
            "deviceCode": device_code
        });

        let resp = self.client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Device token poll failed: {}", e))?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();

        if status.is_success() {
            let token: TokenResponse = serde_json::from_str(&text)
                .map_err(|e| format!("Failed to parse token: {}", e))?;
            return Ok(DevicePollResult::Success(token));
        }

        // 解析错误响应
        if let Ok(err) = serde_json::from_str::<DeviceErrorResponse>(&text) {
            match err.error.as_str() {
                "authorization_pending" => Ok(DevicePollResult::Pending),
                "slow_down" => Ok(DevicePollResult::SlowDown),
                "expired_token" => Ok(DevicePollResult::Expired),
                "access_denied" => Ok(DevicePollResult::Denied),
                _ => Err(format!("Device auth error: {}", err.error)),
            }
        } else {
            Err(format!("Device token poll failed ({}): {}", status, text))
        }
    }
}

/// 设备授权响应
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceAuthorizationResponse {
    #[serde(rename = "deviceCode")]
    pub device_code: String,
    #[serde(rename = "userCode")]
    pub user_code: String,
    #[serde(rename = "verificationUri")]
    pub verification_uri: String,
    #[serde(rename = "verificationUriComplete")]
    pub verification_uri_complete: Option<String>,
    #[serde(rename = "expiresIn")]
    pub expires_in: i64,
    pub interval: Option<i64>,
}

/// 设备授权错误响应
#[derive(Debug, Deserialize)]
struct DeviceErrorResponse {
    error: String,
}

/// 设备轮询结果
#[derive(Debug)]
pub enum DevicePollResult {
    Success(TokenResponse),
    Pending,
    SlowDown,
    Expired,
    Denied,
}
