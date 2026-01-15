// 浏览器打开工具

use crate::commands::app_settings_cmd::get_browser_path;
use serde::Serialize;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// 创建静默进程命令（Windows 下不弹出控制台窗口）
fn silent_command(program: &str) -> std::process::Command {
    #[allow(unused_mut)]
    let mut cmd = std::process::Command::new(program);
    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    cmd
}

/// 打开浏览器访问指定 URL
/// 如果用户配置了自定义浏览器路径，则使用自定义浏览器
/// 否则使用系统默认浏览器
pub fn open_browser(url: &str) -> Result<(), String> {
    if let Some(browser_path) = get_browser_path() {
        open_with_custom_browser(&browser_path, url)
    } else {
        open_with_default_browser(url)
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedBrowser {
    pub name: String,
    pub path: String,
    pub incognito_arg: String,
}

/// 检测系统中安装的浏览器
#[cfg(target_os = "windows")]
pub fn detect_browsers() -> Vec<DetectedBrowser> {
    use std::path::Path;
    
    let browsers = vec![
        ("Chrome", r"C:\Program Files\Google\Chrome\Application\chrome.exe", "--incognito"),
        ("Chrome (x86)", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe", "--incognito"),
        ("Edge", r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe", "--inprivate"),
        ("Edge", r"C:\Program Files\Microsoft\Edge\Application\msedge.exe", "--inprivate"),
        ("Firefox", r"C:\Program Files\Mozilla Firefox\firefox.exe", "-private-window"),
        ("Firefox (x86)", r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe", "-private-window"),
        ("Brave", r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe", "--incognito"),
        ("Brave (x86)", r"C:\Program Files (x86)\BraveSoftware\Brave-Browser\Application\brave.exe", "--incognito"),
    ];
    
    let mut detected = Vec::new();
    for (name, path, incognito_arg) in browsers {
        if Path::new(path).exists() {
            detected.push(DetectedBrowser {
                name: name.to_string(),
                path: path.to_string(),
                incognito_arg: incognito_arg.to_string(),
            });
        }
    }
    detected
}

#[cfg(not(target_os = "windows"))]
pub fn detect_browsers() -> Vec<DetectedBrowser> {
    use std::path::Path;
    
    let browsers = vec![
        ("Chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "--incognito"),
        ("Firefox", "/Applications/Firefox.app/Contents/MacOS/firefox", "-private-window"),
        ("Safari", "/Applications/Safari.app/Contents/MacOS/Safari", ""),
        ("Edge", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge", "--inprivate"),
        ("Brave", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser", "--incognito"),
    ];
    
    let mut detected = Vec::new();
    for (name, path, incognito_arg) in browsers {
        if Path::new(path).exists() {
            detected.push(DetectedBrowser {
                name: name.to_string(),
                path: path.to_string(),
                incognito_arg: incognito_arg.to_string(),
            });
        }
    }
    detected
}

/// 使用自定义浏览器打开 URL
/// browser_path 格式: "路径" 参数1 参数2... 或 路径 参数1 参数2...
/// 例如: "C:\Program Files\Google\Chrome\Application\chrome.exe" --incognito
fn open_with_custom_browser(browser_path: &str, url: &str) -> Result<(), String> {
    let browser_path = browser_path.trim();
    if browser_path.is_empty() {
        return Err("浏览器路径为空".to_string());
    }

    let (exe_path, rest) = if browser_path.starts_with('"') {
        // 路径被引号包裹: "C:\Program Files\...\chrome.exe" --incognito
        if let Some(end_quote) = browser_path[1..].find('"') {
            let path = &browser_path[1..=end_quote];
            let remaining = browser_path[end_quote + 2..].trim();
            (path, remaining)
        } else {
            // 没有结束引号，整个当作路径
            (browser_path.trim_matches('"'), "")
        }
    } else {
        // 没有引号，按空格分割（第一部分是路径）
        if let Some(space_idx) = browser_path.find(' ') {
            (&browser_path[..space_idx], browser_path[space_idx..].trim())
        } else {
            (browser_path, "")
        }
    };

    let mut args: Vec<&str> = if rest.is_empty() {
        vec![]
    } else {
        rest.split_whitespace().collect()
    };
    args.push(url);

    println!("[Browser] Opening with custom browser: {} {:?}", exe_path, args);

    silent_command(exe_path)
        .args(&args)
        .spawn()
        .map_err(|e| format!("打开自定义浏览器失败: {} (路径: {})", e, exe_path))?;

    Ok(())
}

/// 使用系统默认浏览器打开 URL
fn open_with_default_browser(url: &str) -> Result<(), String> {
    println!("[Browser] Opening with default browser: {}", url);

    #[cfg(target_os = "windows")]
    {
        silent_command("rundll32")
            .args(["url.dll,FileProtocolHandler", url])
            .spawn()
            .map_err(|e| format!("打开浏览器失败: {}", e))?;
    }

    #[cfg(not(target_os = "windows"))]
    {
        open::that(url)
            .map_err(|e| format!("打开浏览器失败: {}", e))?;
    }

    Ok(())
}


// ===== Tauri Command =====

#[tauri::command]
pub async fn detect_installed_browsers() -> Vec<DetectedBrowser> {
    detect_browsers()
}
