use crate::browser::open_browser;
use reqwest::Client;
use serde::Deserialize;
use std::time::Duration;

/// Kiro Authentication Service Client
/// 负责与 https://prod.us-east-1.auth.desktop.kiro.dev 通信
pub struct KiroAuthServiceClient {
    endpoint: String,
    client: Client,
}

impl KiroAuthServiceClient {
    pub fn new() -> Self {
        let endpoint = "https://prod.us-east-1.auth.desktop.kiro.dev".to_string();

        let client = Client::builder()
            .timeout(Duration::from_millis(10_000))
            .user_agent("KiroBatchLoginCLI/1.0.0")
            .build()
            .expect("failed to build reqwest client");

        Self { endpoint, client }
    }

    fn login_url(&self) -> String {
        format!("{}/login", self.endpoint)
    }

    fn create_token_url(&self) -> String {
        format!("{}/oauth/token", self.endpoint)
    }

    fn refresh_token_url(&self) -> String {
        format!("{}/refreshToken", self.endpoint)
    }

    /// 打开浏览器到登录页面
    pub async fn login(
        &self,
        provider: &str,
        redirect_uri: &str,
        code_challenge: &str,
        state: &str,
    ) -> Result<(), String> {
        let login_url = format!(
            "{}?idp={}&redirect_uri={}&code_challenge={}&code_challenge_method=S256&state={}",
            self.login_url(),
            provider,
            urlencoding::encode(redirect_uri),
            code_challenge,
            state,
        );

        println!("\n[1] KIRO AUTH LOGIN");
        println!("Provider: {}", provider);
        println!("Redirect URI: {}", redirect_uri);
        println!("Code Challenge: {}", code_challenge);
        println!("State: {}", state);
        println!();

        let login_url = login_url.trim().to_string();
        
        open_browser(&login_url)?;

        Ok(())
    }

    /// 交换授权码为访问令牌
    pub async fn create_token<T: for<'de> Deserialize<'de>>(
        &self,
        code: &str,
        code_verifier: &str,
        redirect_uri: &str,
        invitation_code: Option<&str>,
    ) -> Result<T, String> {
        println!("\n[6] CREATE TOKEN REQUEST");
        println!("URL: {}", self.create_token_url());
        println!("Code: {}", code);
        println!("Code Verifier: {}", code_verifier);
        println!("Redirect URI: {}", redirect_uri);

        #[derive(serde::Serialize)]
        struct Body<'a> {
            code: &'a str,
            code_verifier: &'a str,
            redirect_uri: &'a str,
            invitation_code: Option<&'a str>,
        }

        let body = Body {
            code,
            code_verifier,
            redirect_uri,
            invitation_code,
        };

        let resp = self
            .client
            .post(self.create_token_url())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Kiro Auth Service request failed: {}", e))?;

        let status = resp.status();
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Kiro Auth Service read body failed: {}", e))?;

        println!("\n[6] CREATE TOKEN RESPONSE");
        println!("Status: {}", status);
        
        let body_str = String::from_utf8_lossy(&bytes);
        
        if !status.is_success() {
            println!("Error: {}", body_str);
            return Err(format!(
                "Kiro Auth Service token creation failed: {} - {}",
                status,
                body_str
            ));
        }

        // 完整格式化打印 JSON
        match serde_json::from_str::<serde_json::Value>(&body_str) {
            Ok(json) => {
                match serde_json::to_string_pretty(&json) {
                    Ok(pretty) => println!("{}", pretty),
                    Err(_) => println!("{}", body_str),
                }
            }
            Err(_) => println!("{}", body_str),
        }
        println!();

        serde_json::from_slice::<T>(&bytes).map_err(|e| format!(
            "Kiro Auth Service token creation parse failed: {}",
            e
        ))
    }

    /// 刷新访问令牌
    pub async fn refresh_token<T: for<'de> Deserialize<'de>>(
        &self,
        refresh_token: &str,
    ) -> Result<T, String> {
        println!("\n[Social] REFRESH TOKEN REQUEST");
        println!("URL: {}", self.refresh_token_url());
        println!("RefreshToken: {}...", &refresh_token[..20.min(refresh_token.len())]);

        #[derive(serde::Serialize)]
        struct Body<'a> {
            #[serde(rename = "refreshToken")]
            refresh_token: &'a str,
        }

        let body = Body { refresh_token };

        let resp = self
            .client
            .post(self.refresh_token_url())
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("Kiro Auth Service request failed: {}", e))?;

        let status = resp.status();
        let bytes = resp
            .bytes()
            .await
            .map_err(|e| format!("Kiro Auth Service read body failed: {}", e))?;

        println!("\n[Social] REFRESH TOKEN RESPONSE");
        println!("Status: {}", status);

        let body_str = String::from_utf8_lossy(&bytes);

        if !status.is_success() {
            println!("Error: {}", body_str);
            if status.as_u16() == 401 {
                return Err("RefreshToken 已过期或无效".to_string());
            }
            return Err(format!(
                "Kiro Auth Service token refresh failed: {} - {}",
                status,
                body_str
            ));
        }

        // 格式化打印 JSON
        match serde_json::from_str::<serde_json::Value>(&body_str) {
            Ok(json) => {
                match serde_json::to_string_pretty(&json) {
                    Ok(pretty) => println!("{}", pretty),
                    Err(_) => println!("{}", body_str),
                }
            }
            Err(_) => println!("{}", body_str),
        }

        serde_json::from_slice::<T>(&bytes).map_err(|e| format!(
            "Kiro Auth Service token refresh parse failed: {}",
            e
        ))
    }
}
