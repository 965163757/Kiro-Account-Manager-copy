// 更新检查命令 - 支持代理

use serde::{Deserialize, Serialize};
use reqwest::Proxy;

const UPDATE_URL: &str = "https://github.com/hj01857655/kiro-account-manager/releases/latest/download/latest.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateInfo {
    pub version: String,
    pub notes: String,
    pub pub_date: String,
    pub platforms: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub notes: Option<String>,
    pub download_url: Option<String>,
}

/// 获取 Kiro IDE 设置中的代理
fn get_proxy_from_kiro_settings() -> Option<String> {
    #[cfg(target_os = "windows")]
    let path = std::env::var("APPDATA").ok().map(|appdata| {
        std::path::PathBuf::from(appdata).join("Kiro").join("User").join("settings.json")
    });
    
    #[cfg(target_os = "macos")]
    let path = std::env::var("HOME").ok().map(|home| {
        std::path::PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join("Kiro")
            .join("User")
            .join("settings.json")
    });
    
    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    let path: Option<std::path::PathBuf> = None;
    
    path.and_then(|p| {
        if p.exists() {
            std::fs::read_to_string(&p).ok()
        } else {
            None
        }
    })
    .and_then(|content| {
        serde_json::from_str::<serde_json::Value>(&content).ok()
    })
    .and_then(|json| {
        json.get("http.proxy")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
    })
}

/// 构建 HTTP 客户端（支持代理）
fn build_http_client() -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30));
    
    // 尝试从 Kiro 设置获取代理
    if let Some(proxy_url) = get_proxy_from_kiro_settings() {
        println!("[Update] 使用代理: {}", proxy_url);
        let proxy = Proxy::all(&proxy_url)
            .map_err(|e| format!("代理配置错误: {}", e))?;
        builder = builder.proxy(proxy);
    } else {
        println!("[Update] 未配置代理，直连");
    }
    
    builder.build().map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

/// 获取当前平台的下载 URL
fn get_platform_download_url(platforms: &serde_json::Value) -> Option<String> {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    let platform_key = "windows-x86_64-nsis";
    
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    let platform_key = "darwin-x86_64";
    
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let platform_key = "darwin-aarch64";
    
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64")
    )))]
    let platform_key = "";
    
    platforms.get(platform_key)
        .and_then(|p| p.get("url"))
        .and_then(|u| u.as_str())
        .map(|s| s.to_string())
}

#[tauri::command]
pub async fn check_update() -> Result<UpdateCheckResult, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    
    let client = build_http_client()?;
    
    let response = client.get(UPDATE_URL)
        .send()
        .await
        .map_err(|e| format!("请求更新信息失败: {}", e))?;
    
    if !response.status().is_success() {
        return Err(format!("服务器返回错误: {}", response.status()));
    }
    
    let update_info: UpdateInfo = response.json()
        .await
        .map_err(|e| format!("解析更新信息失败: {}", e))?;
    
    // 比较版本号
    let has_update = compare_versions(&current_version, &update_info.version);
    
    let download_url = if has_update {
        get_platform_download_url(&update_info.platforms)
    } else {
        None
    };
    
    Ok(UpdateCheckResult {
        has_update,
        current_version,
        latest_version: Some(update_info.version),
        notes: Some(update_info.notes),
        download_url,
    })
}

/// 比较版本号，返回 true 表示有新版本
fn compare_versions(current: &str, latest: &str) -> bool {
    let parse_version = |v: &str| -> Vec<u32> {
        v.trim_start_matches('v')
            .split('.')
            .filter_map(|s| s.parse().ok())
            .collect()
    };
    
    let current_parts = parse_version(current);
    let latest_parts = parse_version(latest);
    
    for i in 0..std::cmp::max(current_parts.len(), latest_parts.len()) {
        let c = current_parts.get(i).copied().unwrap_or(0);
        let l = latest_parts.get(i).copied().unwrap_or(0);
        if l > c {
            return true;
        } else if l < c {
            return false;
        }
    }
    false
}
