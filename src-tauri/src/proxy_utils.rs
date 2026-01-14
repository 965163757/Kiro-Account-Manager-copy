// 代理工具模块 - 提供获取代理配置的统一接口

use reqwest::{Client, Proxy};
use std::time::Duration;

/// 从应用自身设置中获取代理配置
fn get_app_proxy() -> Option<String> {
    let data_dir = dirs::data_dir()?;
    let path = data_dir
        .join(".kiro-account-manager")
        .join("app-settings.json");

    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(proxy) = json.get("proxy").and_then(|v| v.as_str()) {
                    if !proxy.is_empty() {
                        return Some(proxy.to_string());
                    }
                }
            }
        }
    }
    None
}

/// 从 Kiro 设置中获取代理配置
pub fn get_configured_proxy() -> Option<String> {
    // 1. 优先从应用自身设置读取
    if let Some(proxy) = get_app_proxy() {
        println!("[Proxy] Using app proxy: {}", proxy);
        return Some(proxy);
    }

    // 2. 从 Kiro IDE 设置读取
    #[cfg(target_os = "macos")]
    {
        let home = std::env::var("HOME").ok()?;
        let path = std::path::PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Kiro")
            .join("User")
            .join("settings.json");

        if path.exists() {
            if let Ok(content) = std::fs::read_to_string(&path) {
                if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                    if let Some(proxy) = json.get("http.proxy").and_then(|v| v.as_str()) {
                        if !proxy.is_empty() {
                            println!("[Proxy] Using Kiro IDE proxy: {}", proxy);
                            return Some(proxy.to_string());
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "windows")]
    {
        if let Ok(appdata) = std::env::var("APPDATA") {
            let path = std::path::PathBuf::from(appdata)
                .join("Kiro")
                .join("User")
                .join("settings.json");

            if path.exists() {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                        if let Some(proxy) = json.get("http.proxy").and_then(|v| v.as_str()) {
                            if !proxy.is_empty() {
                                println!("[Proxy] Using Kiro IDE proxy: {}", proxy);
                                return Some(proxy.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    // 3. 尝试从环境变量获取
    let env_proxy = std::env::var("HTTP_PROXY")
        .or_else(|_| std::env::var("http_proxy"))
        .or_else(|_| std::env::var("HTTPS_PROXY"))
        .or_else(|_| std::env::var("https_proxy"))
        .ok();

    if let Some(ref proxy) = env_proxy {
        println!("[Proxy] Using environment proxy: {}", proxy);
    }

    env_proxy
}

/// 创建带代理支持的 HTTP 客户端
pub fn create_http_client() -> Client {
    create_http_client_with_timeout(30)
}

/// 创建带代理支持的 HTTP 客户端（可指定超时）
pub fn create_http_client_with_timeout(timeout_secs: u64) -> Client {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(timeout_secs));

    // 尝试配置代理
    if let Some(proxy_url) = get_configured_proxy() {
        println!("[HTTP Client] Using proxy: {}", proxy_url);
        if let Ok(proxy) = Proxy::all(&proxy_url) {
            builder = builder.proxy(proxy);
        } else {
            println!("[HTTP Client] Failed to parse proxy URL: {}", proxy_url);
        }
    } else {
        println!("[HTTP Client] No proxy configured");
    }

    builder.build().expect("Failed to create HTTP client")
}
