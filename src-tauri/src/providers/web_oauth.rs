// Web OAuth Provider - Cognito + KiroWebPortalService (CBOR) 登录
// 基于 docs/api/web/OAuth.md 流程实现
// 独立于现有的 AuthDesktopService 登录

use super::{AuthProvider, AuthResult, RefreshMetadata};
use async_trait::async_trait;
use serde::{Deserialize, Serialize};

// ============================================================
// 常量配置
// ============================================================

const KIRO_WEB_PORTAL: &str = "https://app.kiro.dev";
const KIRO_REDIRECT_URI: &str = "https://app.kiro.dev/signin/oauth";

// ============================================================
// CBOR 编解码
// ============================================================

/// CBOR 编码请求体
fn cbor_encode<T: Serialize>(value: &T) -> Result<Vec<u8>, String> {
    let mut buf = Vec::new();
    ciborium::into_writer(value, &mut buf)
        .map_err(|e| format!("CBOR encode error: {}", e))?;
    Ok(buf)
}

/// CBOR 解码响应体
fn cbor_decode<T: for<'de> Deserialize<'de>>(data: &[u8]) -> Result<T, String> {
    ciborium::from_reader(data)
        .map_err(|e| format!("CBOR decode error: {}", e))
}

// ============================================================
// 请求/响应结构
// ============================================================

/// InitiateLogin 请求
#[derive(Debug, Serialize)]
struct InitiateLoginRequest {
    idp: String,
    #[serde(rename = "redirectUri")]
    redirect_uri: String,
    #[serde(rename = "codeChallenge")]
    code_challenge: String,
    #[serde(rename = "codeChallengeMethod")]
    code_challenge_method: String,
    state: String,
}

/// InitiateLogin 响应
#[derive(Debug, Deserialize)]
pub struct InitiateLoginResponse {
    #[serde(rename = "redirectUrl")]
    redirect_url: Option<String>,
}

/// ExchangeToken 请求
#[derive(Debug, Serialize)]
struct ExchangeTokenRequest {
    idp: String,
    code: String,
    #[serde(rename = "codeVerifier")]
    code_verifier: String,
    #[serde(rename = "redirectUri")]
    redirect_uri: String,
    state: String,
}

/// ExchangeToken 响应 (CBOR body)
#[derive(Debug, Deserialize)]
pub struct ExchangeTokenCborResponse {
    #[serde(rename = "accessToken")]
    access_token: Option<String>,
    #[serde(rename = "csrfToken")]
    csrf_token: Option<String>,
    #[serde(rename = "expiresIn")]
    expires_in: Option<i64>,
    #[serde(rename = "profileArn")]
    profile_arn: Option<String>,
}

/// ExchangeToken 完整结果 (body | Set-Cookie 合并)
#[derive(Debug, Serialize)]
pub struct ExchangeTokenResult {
    pub access_token: Option<String>,   // body | Set-Cookie
    pub csrf_token: Option<String>,     // body
    pub expires_in: Option<i64>,        // body
    pub profile_arn: Option<String>,    // body
    pub session_token: Option<String>,  // Set-Cookie RefreshToken
    pub idp: Option<String>,            // Set-Cookie
}

/// RefreshToken 请求
#[derive(Debug, Serialize)]
struct RefreshTokenRequest {
    #[serde(rename = "csrfToken")]
    csrf_token: String,
}

/// RefreshToken 响应
#[derive(Debug, Deserialize)]
pub struct RefreshTokenResponse {
    #[serde(rename = "accessToken")]
    access_token: Option<String>,
    #[serde(rename = "csrfToken")]
    csrf_token: Option<String>,
    #[serde(rename = "expiresIn")]
    expires_in: Option<i64>,
    #[serde(rename = "profileArn")]
    profile_arn: Option<String>,
}

/// GetUserInfo 响应
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GetUserInfoResponse {
    pub email: Option<String>,
    #[serde(rename = "userId")]
    pub user_id: Option<String>,
    pub idp: Option<String>,
    pub status: Option<String>,
    #[serde(rename = "featureFlags")]
    pub feature_flags: Option<serde_json::Value>,
}

/// GetUserUsageAndLimits 请求
#[derive(Debug, Serialize)]
struct GetUserUsageAndLimitsRequest {
    #[serde(rename = "isEmailRequired")]
    is_email_required: bool,
    origin: String,
}

/// GetUserUsageAndLimits 响应 - 用量信息
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct UsageBreakdown {
    #[serde(rename = "resourceType")]
    pub resource_type: Option<String>,
    #[serde(rename = "usageLimit")]
    pub usage_limit: Option<i32>,
    #[serde(rename = "currentUsage")]
    pub current_usage: Option<i32>,
    #[serde(rename = "usageLimitWithPrecision")]
    pub usage_limit_with_precision: Option<f64>,
    #[serde(rename = "currentUsageWithPrecision")]
    pub current_usage_with_precision: Option<f64>,
    #[serde(rename = "overageRate")]
    pub overage_rate: Option<f64>,
    #[serde(rename = "overageCap")]
    pub overage_cap: Option<i32>,
    pub currency: Option<String>,
    #[serde(rename = "freeTrialInfo")]
    pub free_trial_info: Option<FreeTrialInfo>,
    pub bonuses: Option<Vec<BonusInfo>>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct FreeTrialInfo {
    #[serde(rename = "freeTrialStatus")]
    pub free_trial_status: Option<String>,
    #[serde(rename = "usageLimit")]
    pub usage_limit: Option<i32>,
    #[serde(rename = "currentUsage")]
    pub current_usage: Option<i32>,
    #[serde(rename = "freeTrialExpiry")]
    pub free_trial_expiry: Option<f64>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BonusInfo {
    #[serde(rename = "bonusCode")]
    pub bonus_code: Option<String>,
    #[serde(rename = "displayName")]
    pub display_name: Option<String>,
    #[serde(rename = "usageLimit")]
    pub usage_limit: Option<f64>,
    #[serde(rename = "currentUsage")]
    pub current_usage: Option<f64>,
    #[serde(rename = "expiresAt")]
    pub expires_at: Option<f64>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct SubscriptionInfo {
    #[serde(rename = "subscriptionType")]
    pub subscription_type: Option<String>,
    #[serde(rename = "subscriptionTitle")]
    pub subscription_title: Option<String>,
}

/// GetUserUsageAndLimits 响应
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct GetUserUsageAndLimitsResponse {
    #[serde(rename = "usageBreakdownList")]
    pub usage_breakdown_list: Option<Vec<UsageBreakdown>>,
    #[serde(rename = "subscriptionInfo")]
    pub subscription_info: Option<SubscriptionInfo>,
    #[serde(rename = "daysUntilReset")]
    pub days_until_reset: Option<i32>,
    #[serde(rename = "nextDateReset")]
    pub next_date_reset: Option<f64>,
    #[serde(rename = "userInfo")]
    pub user_info: Option<GetUserInfoResponse>,
}

// ============================================================
// PKCE 工具函数
// ============================================================

/// 生成 code_verifier (43-128 字符的随机字符串)
pub fn generate_code_verifier() -> String {
    use rand::Rng;
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..32).map(|_| rng.gen()).collect();
    base64_url_encode(&bytes)
}

/// 生成 code_challenge = Base64URL(SHA256(code_verifier))
pub fn generate_code_challenge(verifier: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let result = hasher.finalize();
    base64_url_encode(&result)
}

fn base64_url_encode(data: &[u8]) -> String {
    use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
    URL_SAFE_NO_PAD.encode(data)
}

// ============================================================
// KiroWebPortalClient - CBOR API 客户端
// ============================================================

pub struct KiroWebPortalClient {
    client: reqwest::Client,
    endpoint: String,
}

impl KiroWebPortalClient {
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
            endpoint: KIRO_WEB_PORTAL.to_string(),
        }
    }

    /// 调用 InitiateLogin 接口 - 获取 OAuth 重定向 URL
    pub async fn initiate_login(
        &self,
        idp: &str,
        redirect_uri: &str,
        code_challenge: &str,
        state: &str,
    ) -> Result<InitiateLoginResponse, String> {
        let url = format!(
            "{}/service/KiroWebPortalService/operation/InitiateLogin",
            self.endpoint
        );

        let request = InitiateLoginRequest {
            idp: idp.to_string(),
            redirect_uri: redirect_uri.to_string(),
            code_challenge: code_challenge.to_string(),
            code_challenge_method: "S256".to_string(),
            state: state.to_string(),
        };

        let body = cbor_encode(&request)?;

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/cbor")
            .header("Accept", "application/cbor")
            .header("smithy-protocol", "rpc-v2-cbor")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("InitiateLogin request failed: {}", e))?;

        let status = response.status();
        let bytes = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            return Err(format!("InitiateLogin failed ({}): {:?}", status, bytes));
        }

        cbor_decode(&bytes)
    }

    /// 调用 ExchangeToken 接口
    pub async fn exchange_token(
        &self,
        idp: &str,
        code: &str,
        code_verifier: &str,
        redirect_uri: &str,
        state: &str,
    ) -> Result<ExchangeTokenResult, String> {
        let url = format!(
            "{}/service/KiroWebPortalService/operation/ExchangeToken",
            self.endpoint
        );

        let request = ExchangeTokenRequest {
            idp: idp.to_string(),
            code: code.to_string(),
            code_verifier: code_verifier.to_string(),
            redirect_uri: redirect_uri.to_string(),
            state: state.to_string(),
        };

        println!("[WebOAuth] ExchangeToken Request: {}", serde_json::to_string_pretty(&serde_json::json!({
            "url": url,
            "idp": idp,
            "code": format!("{}...{}", &code[..20.min(code.len())], if code.len() > 30 { &code[code.len()-10..] } else { "" }),
            "codeVerifier": code_verifier,
            "redirectUri": redirect_uri,
            "state": format!("{}...", &state[..40.min(state.len())])
        })).unwrap_or_default());

        let body = cbor_encode(&request)?;

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/cbor")
            .header("Accept", "application/cbor")
            .header("smithy-protocol", "rpc-v2-cbor")
            .body(body)
            .send()
            .await
            .map_err(|e| format!("ExchangeToken request failed: {}", e))?;

        let status = response.status();
        
        // 打印所有响应头
        println!("[WebOAuth] ExchangeToken Response Headers:");
        for (name, value) in response.headers().iter() {
            if let Ok(v) = value.to_str() {
                println!("  {}: {}", name, v);
            }
        }
        
        // 从 Set-Cookie 响应头提取 cookie
        let mut cookie_session_token: Option<String> = None;
        let mut cookie_access_token: Option<String> = None;
        let mut cookie_idp: Option<String> = None;
        
        for value in response.headers().get_all("set-cookie") {
            if let Ok(cookie_str) = value.to_str() {
                println!("[WebOAuth] Set-Cookie raw: {}", cookie_str);
                if let Ok(c) = cookie::Cookie::parse(cookie_str) {
                    println!("[WebOAuth] Set-Cookie parsed: {}={}", c.name(), &c.value()[..20.min(c.value().len())]);
                    match c.name() {
                        "RefreshToken" => cookie_session_token = Some(c.value().to_string()),
                        "AccessToken" => cookie_access_token = Some(c.value().to_string()),
                        "Idp" => cookie_idp = Some(c.value().to_string()),
                        _ => {}
                    }
                }
            }
        }
        
        let bytes = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            let error_msg = if let Ok(error) = cbor_decode::<serde_json::Value>(&bytes) {
                serde_json::to_string(&error).unwrap_or_default()
            } else {
                String::from_utf8_lossy(&bytes).to_string()
            };
            println!("[WebOAuth] ExchangeToken Error: {}", serde_json::to_string_pretty(&serde_json::json!({"status": status.to_string(), "error": error_msg})).unwrap_or_default());
            return Err(format!("ExchangeToken failed ({}): {}", status, error_msg));
        }

        println!("[WebOAuth] ExchangeToken Status: {} ({} bytes)", status, bytes.len());
        
        // 打印原始响应体 (CBOR -> JSON)
        if let Ok(raw_json) = cbor_decode::<serde_json::Value>(&bytes) {
            println!("[WebOAuth] ExchangeToken Response Body: {}", 
                serde_json::to_string_pretty(&raw_json).unwrap_or_default());
        }
        
        let cbor_resp: ExchangeTokenCborResponse = cbor_decode(&bytes)?;
        
        Ok(ExchangeTokenResult {
            access_token: cbor_resp.access_token.or(cookie_access_token),  // body | Set-Cookie
            csrf_token: cbor_resp.csrf_token,
            expires_in: cbor_resp.expires_in,
            profile_arn: cbor_resp.profile_arn,
            session_token: cookie_session_token,  // Set-Cookie (SessionToken or RefreshToken)
            idp: cookie_idp,  // Set-Cookie only
        })
    }

    /// 调用 RefreshToken 接口
    /// access_token: AccessToken cookie
    /// csrf_token: csrfToken (body 和 x-csrf-token header)
    /// refresh_token: RefreshToken cookie
    /// idp: Idp cookie (Google/Github)
    pub async fn refresh_token_with_cookies(
        &self,
        access_token: &str,
        csrf_token: &str,
        session_token: &str,
        idp: &str,
    ) -> Result<RefreshTokenResponse, String> {
        let url = format!(
            "{}/service/KiroWebPortalService/operation/RefreshToken",
            self.endpoint
        );

        // body 里传 csrfToken 值
        let request = RefreshTokenRequest {
            csrf_token: csrf_token.to_string(),
        };

        let body = cbor_encode(&request)?;
        
        let cookie = format!(
            "AccessToken={}; RefreshToken={}; Idp={}", 
            access_token, session_token, idp
        );

        println!("[WebOAuth] RefreshToken Request: {}", serde_json::to_string_pretty(&serde_json::json!({
            "url": url,
            "idp": idp,
            "accessToken": format!("{}...", &access_token[..20.min(access_token.len())]),
            "refreshToken": format!("{}...", &session_token[..20.min(session_token.len())]),
            "csrfToken": csrf_token
        })).unwrap_or_default());

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/cbor")
            .header("Accept", "application/cbor")
            .header("smithy-protocol", "rpc-v2-cbor")
            .header("x-csrf-token", csrf_token)
            .header("Cookie", cookie)
            .body(body)
            .send()
            .await
            .map_err(|e| format!("RefreshToken request failed: {}", e))?;

        let status = response.status();
        let bytes = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            let error_msg = if let Ok(error) = cbor_decode::<serde_json::Value>(&bytes) {
                serde_json::to_string(&error).unwrap_or_default()
            } else {
                String::from_utf8_lossy(&bytes).to_string()
            };
            println!("[WebOAuth] RefreshToken Error: {}", serde_json::to_string_pretty(&serde_json::json!({"status": status.to_string(), "error": error_msg})).unwrap_or_default());
            
            // 423 Locked = AccountSuspendedException = 账号被封禁
            if status.as_u16() == 423 || error_msg.contains("AccountSuspendedException") {
                return Err("BANNED: 账号已被封禁".to_string());
            }
            return Err(format!("RefreshToken failed ({}): {}", status, error_msg));
        }

        println!("[WebOAuth] RefreshToken Status: {} ({} bytes)", status, bytes.len());
        
        // 打印原始响应体 (CBOR -> JSON)
        if let Ok(raw_json) = cbor_decode::<serde_json::Value>(&bytes) {
            println!("[WebOAuth] RefreshToken Response Body: {}", 
                serde_json::to_string_pretty(&raw_json).unwrap_or_default());
        }
        
        cbor_decode(&bytes)
    }

    /// 调用 GetUserInfo 接口 (KiroWebPortalService)
    /// 使用 Cookie 认证: AccessToken, Idp (不需要 csrfToken)
    pub async fn get_user_info(
        &self,
        access_token: &str,
        _csrf_token: &str,  // 保留参数兼容性，但不再使用
        _session_token: &str,
        idp: &str,
    ) -> Result<GetUserInfoResponse, String> {
        let url = format!(
            "{}/service/KiroWebPortalService/operation/GetUserInfo",
            self.endpoint
        );

        #[derive(Serialize)]
        struct GetUserInfoRequest {
            origin: String,
        }

        let request = GetUserInfoRequest {
            origin: "KIRO_IDE".to_string(),
        };

        let body = cbor_encode(&request)?;
        // 简化 Cookie，只需要 Idp 和 AccessToken
        let cookie = format!("Idp={}; AccessToken={}", idp, access_token);

        println!("[WebOAuth] GetUserInfo Request: {}", serde_json::to_string_pretty(&serde_json::json!({
            "url": url,
            "idp": idp
        })).unwrap_or_default());

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/cbor")
            .header("Accept", "application/cbor")
            .header("smithy-protocol", "rpc-v2-cbor")
            .header("authorization", format!("Bearer {}", access_token))
            // 不再需要 x-csrf-token
            .header("Cookie", cookie)
            .body(body)
            .send()
            .await
            .map_err(|e| format!("GetUserInfo request failed: {}", e))?;

        let status = response.status();
        let bytes = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            let error_msg = if let Ok(error) = cbor_decode::<serde_json::Value>(&bytes) {
                serde_json::to_string(&error).unwrap_or_default()
            } else {
                String::from_utf8_lossy(&bytes).to_string()
            };
            println!("[WebOAuth] GetUserInfo Error: {}", serde_json::to_string_pretty(&serde_json::json!({"status": status.to_string(), "error": error_msg})).unwrap_or_default());
            
            // 423 Locked = AccountSuspendedException = 账号被封禁
            if status.as_u16() == 423 || error_msg.contains("AccountSuspendedException") {
                return Err("BANNED: 账号已被封禁".to_string());
            }
            return Err(format!("GetUserInfo failed ({}): {}", status, error_msg));
        }

        println!("[WebOAuth] GetUserInfo Status: {} ({} bytes)", status, bytes.len());
        
        // 打印原始响应体 (CBOR -> JSON)
        if let Ok(raw_json) = cbor_decode::<serde_json::Value>(&bytes) {
            println!("[WebOAuth] GetUserInfo Response Body: {}", 
                serde_json::to_string_pretty(&raw_json).unwrap_or_default());
        }
        
        let resp: GetUserInfoResponse = cbor_decode(&bytes)?;
        Ok(resp)
    }

    /// 调用 GetUserUsageAndLimits 接口 (KiroWebPortalService)
    /// 使用 Cookie 认证: AccessToken, Idp (不需要 csrfToken)
    pub async fn get_user_usage_and_limits(
        &self,
        access_token: &str,
        _csrf_token: &str,  // 保留参数兼容性，但不再使用
        _session_token: &str,
        idp: &str,
    ) -> Result<GetUserUsageAndLimitsResponse, String> {
        let url = format!(
            "{}/service/KiroWebPortalService/operation/GetUserUsageAndLimits",
            self.endpoint
        );

        let request = GetUserUsageAndLimitsRequest {
            is_email_required: true,
            origin: "KIRO_IDE".to_string(),
        };

        let body = cbor_encode(&request)?;
        // 简化 Cookie，只需要 Idp 和 AccessToken
        let cookie = format!("Idp={}; AccessToken={}", idp, access_token);

        println!("[WebOAuth] GetUserUsageAndLimits Request: {}", serde_json::to_string_pretty(&serde_json::json!({
            "url": url,
            "idp": idp
        })).unwrap_or_default());

        let response = self.client
            .post(&url)
            .header("Content-Type", "application/cbor")
            .header("Accept", "application/cbor")
            .header("smithy-protocol", "rpc-v2-cbor")
            .header("authorization", format!("Bearer {}", access_token))
            // 不再需要 x-csrf-token
            .header("Cookie", cookie)
            .body(body)
            .send()
            .await
            .map_err(|e| format!("GetUserUsageAndLimits request failed: {}", e))?;

        let status = response.status();
        let bytes = response.bytes().await
            .map_err(|e| format!("Failed to read response: {}", e))?;

        if !status.is_success() {
            let error_msg = if let Ok(error) = cbor_decode::<serde_json::Value>(&bytes) {
                serde_json::to_string(&error).unwrap_or_default()
            } else {
                String::from_utf8_lossy(&bytes).to_string()
            };
            println!("[WebOAuth] GetUserUsageAndLimits Error: {}", serde_json::to_string_pretty(&serde_json::json!({"status": status.to_string(), "error": error_msg})).unwrap_or_default());
            
            // 423 Locked = AccountSuspendedException = 账号被封禁
            if status.as_u16() == 423 || error_msg.contains("AccountSuspendedException") {
                return Err("BANNED: 账号已被封禁".to_string());
            }
            return Err(format!("GetUserUsageAndLimits failed ({}): {}", status, error_msg));
        }

        println!("[WebOAuth] GetUserUsageAndLimits Status: {} ({} bytes)", status, bytes.len());
        
        // 打印原始响应体 (CBOR -> JSON)
        if let Ok(raw_json) = cbor_decode::<serde_json::Value>(&bytes) {
            println!("[WebOAuth] GetUserUsageAndLimits Response Body: {}", 
                serde_json::to_string_pretty(&raw_json).unwrap_or_default());
        }
        
        let resp: GetUserUsageAndLimitsResponse = cbor_decode(&bytes)?;
        Ok(resp)
    }
}

// ============================================================
// WebOAuthProvider
// ============================================================

pub struct WebOAuthProvider {
    provider_id: String, // "Google" 或 "Github"
}

impl WebOAuthProvider {
    pub fn new(provider_id: &str) -> Self {
        Self {
            provider_id: provider_id.to_string(),
        }
    }

    /// 获取 API 使用的 idp 名称
    fn get_idp_name(&self) -> &str {
        match self.provider_id.as_str() {
            "Google" => "Google",
            "Github" => "Github",
            other => other,
        }
    }
}

#[async_trait]
impl AuthProvider for WebOAuthProvider {
    async fn login(&self) -> Result<AuthResult, String> {
        // Web OAuth 需要两步流程，不能用单一的 login 方法
        // 请使用 initiate_login() 和 complete_login()
        Err("Web OAuth requires two-step flow: use initiate_login() and complete_login()".to_string())
    }

    async fn refresh_token(&self, _refresh_token: &str, _metadata: RefreshMetadata) -> Result<AuthResult, String> {
        // Web OAuth 刷新需要 access_token 和 csrf_token，不能用这个方法
        // 请使用 refresh_token_impl(access_token, csrf_token)
        Err("Web OAuth refresh requires access_token and csrf_token. Use refresh_token_impl() instead.".to_string())
    }

    fn get_provider_id(&self) -> &str {
        &self.provider_id
    }

    fn get_auth_method(&self) -> &str {
        "web_oauth"
    }
}

impl WebOAuthProvider {
    /// 发起登录 - 返回授权 URL 和需要保存的参数（不自动打开浏览器）
    pub async fn initiate_login(&self) -> Result<WebOAuthInitResult, String> {
        let state = uuid::Uuid::new_v4().to_string();
        let code_verifier = generate_code_verifier();
        let code_challenge = generate_code_challenge(&code_verifier);
        let redirect_uri = KIRO_REDIRECT_URI.to_string();

        let idp = self.get_idp_name();
        
        println!("[WebOAuth] InitiateLogin Request: {}", serde_json::to_string_pretty(&serde_json::json!({
            "provider": self.provider_id,
            "idp": idp,
            "redirectUri": redirect_uri,
            "state": state,
            "codeChallenge": code_challenge
        })).unwrap_or_default());

        let client = KiroWebPortalClient::new();
        let initiate_response = client
            .initiate_login(idp, &redirect_uri, &code_challenge, &state)
            .await?;

        let authorize_url = initiate_response.redirect_url
            .ok_or("No redirectUrl in InitiateLogin response")?;
        
        println!("[WebOAuth] InitiateLogin Response: {}", serde_json::to_string_pretty(&serde_json::json!({
            "redirectUrl": &authorize_url[..100.min(authorize_url.len())]
        })).unwrap_or_default());

        Ok(WebOAuthInitResult {
            authorize_url,
            state,
            code_verifier,
            redirect_uri,
            idp: idp.to_string(),
            provider_id: self.provider_id.clone(),
        })
    }

    /// 完成登录 - 用回调 URL 中的 code 换取 token
    pub async fn complete_login(&self, code: &str, returned_state: &str, code_verifier: &str, _expected_state: &str) -> Result<AuthResult, String> {
        // 注意：returned_state 是 AWS/Cognito 返回的 state（可能是编码后的值）
        // 需要传给 ExchangeToken API

        let idp = self.get_idp_name();
        let redirect_uri = KIRO_REDIRECT_URI;

        let client = KiroWebPortalClient::new();
        let result = client
            .exchange_token(idp, code, code_verifier, redirect_uri, returned_state)
            .await?;

        println!("[WebOAuth] ExchangeToken Response: {}", serde_json::to_string_pretty(&serde_json::json!({
            "accessToken": result.access_token.as_ref().map(|s| format!("{}...{}", &s[..20.min(s.len())], if s.len() > 30 { &s[s.len()-10..] } else { "" })),
            "csrfToken": result.csrf_token,
            "expiresIn": result.expires_in,
            "profileArn": result.profile_arn,
            "sessionToken": result.session_token.as_ref().map(|s| format!("{}...", &s[..20.min(s.len())])),
            "idp": result.idp,
        })).unwrap_or_default());

        // 构建 AuthResult
        let access_token = result.access_token
            .ok_or("No access_token in response")?;
        let csrf_token = result.csrf_token
            .ok_or("No csrf_token in response")?;
        let expires_in = result.expires_in.unwrap_or(3600);
        let expires_at = chrono::Local::now() + chrono::Duration::seconds(expires_in);

        println!("[WebOAuth] Login Success: {}", serde_json::to_string_pretty(&serde_json::json!({
            "provider": self.provider_id,
            "expiresIn": expires_in,
            "expiresAt": expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            "hasSessionToken": result.session_token.is_some()
        })).unwrap_or_default());

        // session_token 是 Set-Cookie 里的 RefreshToken/SessionToken，存到 refresh_token 字段
        let refresh_token = result.session_token
            .ok_or("No RefreshToken/SessionToken cookie from ExchangeToken")?;
        
        Ok(AuthResult {
            access_token,
            refresh_token,  // RefreshToken/SessionToken cookie
            expires_at: expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            provider: self.provider_id.clone(),
            auth_method: "web_oauth".to_string(),
            id_token: None,
            token_type: Some("Bearer".to_string()),
            expires_in,
            region: None,
            client_id: None,
            client_secret: None,
            client_id_hash: None,
            sso_session_id: None,
            profile_arn: result.profile_arn,
            csrf_token: Some(csrf_token),  // csrfToken
            session_token: None,
        })
    }

    /// 刷新 token
    /// access_token: 当前的 AccessToken
    /// csrf_token: 当前的 csrfToken
    /// session_token: 当前的 SessionToken
    pub async fn refresh_token_impl(&self, access_token: &str, csrf_token: &str, session_token: &str) -> Result<AuthResult, String> {
        let idp = self.get_idp_name();
        let client = KiroWebPortalClient::new();
        let token_response = client.refresh_token_with_cookies(access_token, csrf_token, session_token, idp).await?;

        println!("[WebOAuth] RefreshToken Response: {}", serde_json::to_string_pretty(&serde_json::json!({
            "accessToken": token_response.access_token.as_ref().map(|s| format!("{}...", &s[..20.min(s.len())])),
            "csrfToken": token_response.csrf_token,
            "expiresIn": token_response.expires_in,
            "profileArn": token_response.profile_arn
        })).unwrap_or_default());

        let new_access_token = token_response.access_token
            .ok_or("No access_token in response")?;
        let new_csrf_token = token_response.csrf_token
            .ok_or("No csrf_token in response")?;
        let expires_in = token_response.expires_in.unwrap_or(3600);
        let expires_at = chrono::Local::now() + chrono::Duration::seconds(expires_in);

        Ok(AuthResult {
            access_token: new_access_token,
            refresh_token: new_csrf_token.clone(),
            expires_at: expires_at.format("%Y/%m/%d %H:%M:%S").to_string(),
            provider: self.provider_id.clone(),
            auth_method: "web_oauth".to_string(),
            id_token: None,
            token_type: Some("Bearer".to_string()),
            expires_in,
            region: None,
            client_id: None,
            client_secret: None,
            client_id_hash: None,
            sso_session_id: None,
            profile_arn: token_response.profile_arn,
            csrf_token: Some(new_csrf_token),
            session_token: None,
        })
    }
}

/// InitiateLogin 返回的结果，需要保存用于 complete_login
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct WebOAuthInitResult {
    pub authorize_url: String,
    pub state: String,
    pub code_verifier: String,
    pub redirect_uri: String,
    pub idp: String,
    pub provider_id: String,
}
