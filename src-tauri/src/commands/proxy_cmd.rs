// 代理检测命令

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemProxyInfo {
    pub enabled: bool,
    pub proxy_server: Option<String>,
    pub http_proxy: Option<String>,
}

// ============================================================
// Windows: 从注册表读取系统代理
// ============================================================

#[cfg(target_os = "windows")]
fn detect_system_proxy_inner() -> Result<SystemProxyInfo, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let internet_settings = hkcu
        .open_subkey("Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings")
        .map_err(|e| format!("无法打开注册表: {}", e))?;
    
    let proxy_enable: u32 = internet_settings.get_value("ProxyEnable").unwrap_or(0);
    let proxy_server: String = internet_settings.get_value("ProxyServer").unwrap_or_default();
    
    let enabled = proxy_enable == 1;
    let http_proxy = if enabled && !proxy_server.is_empty() {
        // 处理不同格式的代理设置
        // 格式1: 127.0.0.1:7890
        // 格式2: http=127.0.0.1:7890;https=127.0.0.1:7890
        let proxy = if proxy_server.contains('=') {
            // 多协议格式，提取 http 代理
            proxy_server
                .split(';')
                .find(|s| s.starts_with("http="))
                .map(|s| s.trim_start_matches("http="))
                .unwrap_or(&proxy_server)
                .to_string()
        } else {
            proxy_server.clone()
        };
        
        // 确保有 http:// 前缀
        if proxy.starts_with("http://") || proxy.starts_with("https://") {
            Some(proxy)
        } else {
            Some(format!("http://{}", proxy))
        }
    } else {
        None
    };
    
    Ok(SystemProxyInfo {
        enabled,
        proxy_server: if proxy_server.is_empty() { None } else { Some(proxy_server) },
        http_proxy,
    })
}

// ============================================================
// macOS: 从系统偏好设置读取代理
// ============================================================

#[cfg(target_os = "macos")]
fn detect_system_proxy_inner() -> Result<SystemProxyInfo, String> {
    use std::process::Command;
    
    // 获取当前网络服务名称
    let output = Command::new("networksetup")
        .args(["-listallnetworkservices"])
        .output()
        .map_err(|e| format!("执行 networksetup 失败: {}", e))?;
    
    let services = String::from_utf8_lossy(&output.stdout);
    
    // 尝试常见的网络服务名称
    let service_names = ["Wi-Fi", "Ethernet", "USB 10/100/1000 LAN"];
    let mut active_service = None;
    
    for name in &service_names {
        if services.contains(name) {
            active_service = Some(*name);
            break;
        }
    }
    
    let service = active_service.unwrap_or("Wi-Fi");
    
    // 获取 HTTP 代理设置
    let output = Command::new("networksetup")
        .args(["-getwebproxy", service])
        .output()
        .map_err(|e| format!("获取代理设置失败: {}", e))?;
    
    let proxy_info = String::from_utf8_lossy(&output.stdout);
    
    let mut enabled = false;
    let mut server = String::new();
    let mut port = String::new();
    
    for line in proxy_info.lines() {
        if line.starts_with("Enabled:") {
            enabled = line.contains("Yes");
        } else if line.starts_with("Server:") {
            server = line.trim_start_matches("Server:").trim().to_string();
        } else if line.starts_with("Port:") {
            port = line.trim_start_matches("Port:").trim().to_string();
        }
    }
    
    let http_proxy = if enabled && !server.is_empty() && server != "0" {
        Some(format!("http://{}:{}", server, port))
    } else {
        None
    };
    
    let proxy_server = if !server.is_empty() && server != "0" {
        Some(format!("{}:{}", server, port))
    } else {
        None
    };
    
    Ok(SystemProxyInfo {
        enabled,
        proxy_server,
        http_proxy,
    })
}

#[cfg(not(any(target_os = "windows", target_os = "macos")))]
fn detect_system_proxy_inner() -> Result<SystemProxyInfo, String> {
    // Linux: 尝试读取环境变量
    let http_proxy = std::env::var("http_proxy")
        .or_else(|_| std::env::var("HTTP_PROXY"))
        .ok();
    
    Ok(SystemProxyInfo {
        enabled: http_proxy.is_some(),
        proxy_server: http_proxy.clone(),
        http_proxy,
    })
}

// ============================================================
// Tauri Command
// ============================================================

#[tauri::command]
pub async fn detect_system_proxy() -> Result<SystemProxyInfo, String> {
    tokio::task::spawn_blocking(detect_system_proxy_inner)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}
