// 自动注册模块 - 数据结构和核心逻辑

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use chrono::{DateTime, Local};
use uuid::Uuid;

/// 全局自动注册状态
pub static AUTO_REGISTER_STATE: Mutex<Option<AutoRegisterState>> = Mutex::new(None);

/// 自动注册运行状态
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoRegisterState {
    pub is_running: bool,
    pub should_stop: bool,
    pub current_index: u32,
    pub total_count: u32,
    pub current_step: String,
    pub logs: Vec<String>,
    pub error: Option<String>,
    #[serde(skip)]
    pub pending_email: Option<String>,  // 待保存的邮箱（等待密码日志）
}

impl Default for AutoRegisterState {
    fn default() -> Self {
        Self {
            is_running: false,
            should_stop: false,
            current_index: 0,
            total_count: 0,
            current_step: String::new(),
            logs: Vec::new(),
            error: None,
            pending_email: None,
        }
    }
}

/// 完整的自动注册配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoRegisterConfig {
    pub email: EmailConfig,
    pub register: RegisterConfig,
    pub browser: BrowserConfig,
    #[serde(default)]
    pub proxy: ProxyConfig,
    pub execution: ExecutionConfig,
    #[serde(default)]
    pub python: PythonConfig,
}

impl Default for AutoRegisterConfig {
    fn default() -> Self {
        Self {
            email: EmailConfig::default(),
            register: RegisterConfig::default(),
            browser: BrowserConfig::default(),
            proxy: ProxyConfig::default(),
            execution: ExecutionConfig::default(),
            python: PythonConfig::default(),
        }
    }
}

/// 邮箱配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailConfig {
    pub imap_server: String,
    pub imap_port: u16,
    pub email: String,
    pub password: String,
    pub use_ssl: bool,
    pub timeout: u32,        // 验证码超时（秒）
    pub poll_interval: u32,  // 轮询间隔（秒）
}

impl Default for EmailConfig {
    fn default() -> Self {
        Self {
            imap_server: String::new(),
            imap_port: 993,
            email: String::new(),
            password: String::new(),
            use_ssl: true,
            timeout: 180,
            poll_interval: 5,
        }
    }
}

/// 注册参数配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterConfig {
    pub email_prefix: String,
    pub email_domain: String,
    pub password_length: u8,
    pub password_include_uppercase: bool,
    pub password_include_lowercase: bool,
    pub password_include_numbers: bool,
    pub password_include_special: bool,
    pub use_random_name: bool,
}

impl Default for RegisterConfig {
    fn default() -> Self {
        Self {
            email_prefix: String::new(),
            email_domain: String::new(),
            password_length: 14,
            password_include_uppercase: true,
            password_include_lowercase: true,
            password_include_numbers: true,
            password_include_special: true,
            use_random_name: true,
        }
    }
}

/// 浏览器配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserConfig {
    pub browser_type: String,  // "chrome" 或 "roxy"
    pub chrome_path: Option<String>,
    pub chrome_auto_detect: bool,
    // Roxy 配置
    pub roxy_port: Option<u16>,
    pub roxy_token: Option<String>,
    pub roxy_workspace_id: Option<u32>,
    pub roxy_browser_id: Option<String>,
}

impl Default for BrowserConfig {
    fn default() -> Self {
        Self {
            browser_type: "chrome".to_string(),
            chrome_path: None,
            chrome_auto_detect: true,
            roxy_port: Some(50000),
            roxy_token: None,
            roxy_workspace_id: None,
            roxy_browser_id: None,
        }
    }
}

/// 代理配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub enabled: bool,
    pub proxy_type: String,  // "http", "https", "socks5"
    pub host: String,
    pub port: u16,
    pub username: Option<String>,
    pub password: Option<String>,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            enabled: false,
            proxy_type: "http".to_string(),
            host: String::new(),
            port: 8080,
            username: None,
            password: None,
        }
    }
}

/// 执行配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionConfig {
    pub count: u32,      // 注册数量
    pub interval: u32,   // 间隔（秒）
}

impl Default for ExecutionConfig {
    fn default() -> Self {
        Self {
            count: 1,
            interval: 10,
        }
    }
}

/// Python 环境配置
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PythonConfig {
    pub auto_detect: bool,
    pub python_path: Option<String>,
    pub detected_path: Option<String>,
    pub detected_version: Option<String>,
}

impl Default for PythonConfig {
    fn default() -> Self {
        Self {
            auto_detect: true,
            python_path: None,
            detected_path: None,
            detected_version: None,
        }
    }
}

/// 注册进度
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationProgress {
    pub status: String,  // "idle", "running", "paused", "completed", "error"
    pub current_step: String,
    pub current_index: u32,
    pub total_count: u32,
    pub logs: Vec<String>,
    pub error: Option<String>,
}

impl Default for RegistrationProgress {
    fn default() -> Self {
        Self {
            status: "idle".to_string(),
            current_step: String::new(),
            current_index: 0,
            total_count: 0,
            logs: Vec::new(),
            error: None,
        }
    }
}

/// 注册历史记录
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegistrationRecord {
    pub id: String,
    pub timestamp: String,
    pub email: String,
    pub password: String,
    pub status: String,  // "success" 或 "failed"
    pub error: Option<String>,
    pub account_id: Option<String>,
}

impl RegistrationRecord {
    pub fn new(email: String, password: String, status: String) -> Self {
        let now: DateTime<Local> = Local::now();
        Self {
            id: Uuid::new_v4().to_string(),
            timestamp: now.format("%Y/%m/%d %H:%M:%S").to_string(),
            email,
            password,
            status,
            error: None,
            account_id: None,
        }
    }
}


/// 配置存储管理
pub struct AutoRegisterConfigStore {
    config: AutoRegisterConfig,
    history: Vec<RegistrationRecord>,
    config_path: PathBuf,
    history_path: PathBuf,
}

impl AutoRegisterConfigStore {
    pub fn new() -> Self {
        let (config_path, history_path) = Self::get_storage_paths();
        let config = Self::load_config(&config_path);
        let history = Self::load_history(&history_path);
        Self {
            config,
            history,
            config_path,
            history_path,
        }
    }

    fn get_storage_paths() -> (PathBuf, PathBuf) {
        let data_dir = dirs::data_dir().unwrap_or_else(|| {
            let home = std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home)
        });
        let base_dir = data_dir.join(".kiro-account-manager");
        (
            base_dir.join("auto_register_config.json"),
            base_dir.join("auto_register_history.json"),
        )
    }

    fn load_config(path: &PathBuf) -> AutoRegisterConfig {
        if let Ok(content) = std::fs::read_to_string(path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            AutoRegisterConfig::default()
        }
    }

    fn load_history(path: &PathBuf) -> Vec<RegistrationRecord> {
        if let Ok(content) = std::fs::read_to_string(path) {
            serde_json::from_str(&content).unwrap_or_default()
        } else {
            Vec::new()
        }
    }

    pub fn get_config(&self) -> AutoRegisterConfig {
        self.config.clone()
    }

    pub fn save_config(&mut self, config: AutoRegisterConfig) -> Result<(), String> {
        // 验证配置
        Self::validate_config(&config)?;
        
        if let Some(parent) = self.config_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("创建目录失败: {}", e))?;
        }
        
        let json = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("序列化配置失败: {}", e))?;
        
        std::fs::write(&self.config_path, json)
            .map_err(|e| format!("保存配置失败: {}", e))?;
        
        self.config = config;
        Ok(())
    }

    fn validate_config(config: &AutoRegisterConfig) -> Result<(), String> {
        // 验证邮箱配置
        if config.email.imap_server.is_empty() {
            return Err("IMAP 服务器地址不能为空".to_string());
        }
        if config.email.imap_port == 0 {
            return Err("端口号必须在 1-65535 之间".to_string());
        }
        if config.email.email.is_empty() {
            return Err("邮箱地址不能为空".to_string());
        }
        
        // 验证注册配置
        if config.register.email_prefix.is_empty() {
            return Err("邮箱前缀不能为空".to_string());
        }
        if config.register.email_domain.is_empty() || !config.register.email_domain.starts_with('@') {
            return Err("邮箱域名格式不正确，必须以 @ 开头".to_string());
        }
        if config.register.password_length < 8 {
            return Err("密码长度不能少于 8 位".to_string());
        }
        
        // 验证浏览器配置
        if config.browser.browser_type != "chrome" && config.browser.browser_type != "roxy" {
            return Err("浏览器类型必须是 chrome 或 roxy".to_string());
        }
        
        // 验证代理配置
        if config.proxy.enabled {
            if config.proxy.host.is_empty() {
                return Err("代理服务器地址不能为空".to_string());
            }
            if config.proxy.port == 0 {
                return Err("代理端口不能为 0".to_string());
            }
        }
        
        Ok(())
    }

    pub fn get_history(&self) -> Vec<RegistrationRecord> {
        self.history.clone()
    }

    pub fn add_record(&mut self, record: RegistrationRecord) {
        self.history.insert(0, record);
        self.save_history();
    }

    pub fn clear_history(&mut self) {
        self.history.clear();
        self.save_history();
    }

    fn save_history(&self) {
        if let Some(parent) = self.history_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        if let Ok(json) = serde_json::to_string_pretty(&self.history) {
            let _ = std::fs::write(&self.history_path, json);
        }
    }

    pub fn export_history(&self, path: &str) -> Result<(), String> {
        let json = serde_json::to_string_pretty(&self.history)
            .map_err(|e| format!("序列化历史记录失败: {}", e))?;
        std::fs::write(path, json)
            .map_err(|e| format!("导出历史记录失败: {}", e))?;
        Ok(())
    }
}

// ============================================================
// Chrome 浏览器相关功能
// ============================================================

/// 检测 Chrome 浏览器路径
pub fn detect_chrome_path() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let paths = vec![
            r"C:\Program Files\Google\Chrome\Application\chrome.exe".to_string(),
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe".to_string(),
            format!(
                r"{}\AppData\Local\Google\Chrome\Application\chrome.exe",
                std::env::var("USERPROFILE").unwrap_or_default()
            ),
        ];
        for path in paths {
            if std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
        None
    }

    #[cfg(target_os = "macos")]
    {
        let paths = vec![
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome".to_string(),
            format!(
                "{}/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
                std::env::var("HOME").unwrap_or_default()
            ),
        ];
        for path in paths {
            if std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
        None
    }

    #[cfg(not(any(target_os = "windows", target_os = "macos")))]
    {
        // Linux
        let paths = vec![
            "/usr/bin/google-chrome".to_string(),
            "/usr/bin/google-chrome-stable".to_string(),
            "/usr/bin/chromium".to_string(),
            "/usr/bin/chromium-browser".to_string(),
        ];
        for path in paths {
            if std::path::Path::new(&path).exists() {
                return Some(path);
            }
        }
        None
    }
}

/// 查找可用端口
fn find_available_port() -> u16 {
    use std::net::TcpListener;
    
    // 尝试在 9222-9322 范围内找一个可用端口
    for port in 9222..9322 {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return port;
        }
    }
    // 默认返回 9222
    9222
}

/// 构建 Chrome 启动命令参数
pub fn build_chrome_args(url: &str, proxy: Option<&ProxyConfig>) -> (Vec<String>, u16) {
    let mut args = Vec::new();
    
    // 隐私模式
    args.push("--incognito".to_string());
    
    // 远程调试端口
    let debug_port = find_available_port();
    args.push(format!("--remote-debugging-port={}", debug_port));
    
    // 创建临时用户数据目录
    let temp_dir = std::env::temp_dir().join(format!("chrome_auto_{}", debug_port));
    args.push(format!("--user-data-dir={}", temp_dir.display()));
    
    // 代理配置
    if let Some(proxy) = proxy {
        if proxy.enabled {
            let proxy_server = match proxy.proxy_type.as_str() {
                "socks5" => format!("socks5://{}:{}", proxy.host, proxy.port),
                "https" => format!("https://{}:{}", proxy.host, proxy.port),
                _ => format!("http://{}:{}", proxy.host, proxy.port),
            };
            args.push(format!("--proxy-server={}", proxy_server));
        }
    }
    
    // 禁用一些可能影响自动化的功能
    args.extend(vec![
        "--no-first-run".to_string(),
        "--no-default-browser-check".to_string(),
        "--disable-background-networking".to_string(),
        "--disable-client-side-phishing-detection".to_string(),
        "--disable-default-apps".to_string(),
        "--disable-extensions".to_string(),
        "--disable-hang-monitor".to_string(),
        "--disable-popup-blocking".to_string(),
        "--disable-prompt-on-repost".to_string(),
        "--disable-sync".to_string(),
        "--disable-translate".to_string(),
        "--disable-features=TranslateUI".to_string(),
        "--disable-ipc-flooding-protection".to_string(),
        "--disable-renderer-backgrounding".to_string(),
        "--disable-backgrounding-occluded-windows".to_string(),
        "--metrics-recording-only".to_string(),
        "--safebrowsing-disable-auto-update".to_string(),
        "--password-store=basic".to_string(),
        "--use-mock-keychain".to_string(),
        "--enable-features=NetworkService,NetworkServiceInProcess".to_string(),
    ]);
    
    // 目标 URL
    args.push(url.to_string());
    
    (args, debug_port)
}

// ============================================================
// Python 脚本相关功能
// ============================================================

/// 检测 Python 环境
pub fn detect_python() -> Result<String, String> {
    detect_python_with_path(None)
}

/// 检测 Python 环境（支持自定义路径）
pub fn detect_python_with_path(custom_path: Option<&str>) -> Result<String, String> {
    // 如果提供了自定义路径，优先使用
    if let Some(path) = custom_path {
        if !path.is_empty() {
            let result = std::process::Command::new(path)
                .arg("--version")
                .output();
            
            if let Ok(output) = result {
                if output.status.success() {
                    return Ok(path.to_string());
                }
            }
            return Err(format!("指定的 Python 路径无效: {}", path));
        }
    }
    
    // 获取用户主目录
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    
    // 自动检测 - 构建候选路径列表
    let mut commands: Vec<String> = Vec::new();
    
    if cfg!(target_os = "windows") {
        // Windows: 基础命令
        commands.extend(vec![
            "python".to_string(),
            "python3".to_string(),
            "py".to_string(),
        ]);
        
        // Windows: 常见安装路径（多版本支持）
        for version in &["313", "312", "311", "310", "39", "38"] {
            commands.push(format!(r"C:\Python{}\python.exe", version));
            commands.push(format!(r"C:\Program Files\Python{}\python.exe", version));
            commands.push(format!(r"C:\Program Files (x86)\Python{}\python.exe", version));
            // 用户目录下的安装
            if !home_dir.is_empty() {
                commands.push(format!(r"{}\AppData\Local\Programs\Python\Python{}\python.exe", home_dir, version));
            }
        }
        
        // Windows: pyenv-win 路径
        if !home_dir.is_empty() {
            // pyenv shims
            commands.push(format!(r"{}\.pyenv\pyenv-win\shims\python.exe", home_dir));
            commands.push(format!(r"{}\.pyenv\pyenv-win\shims\python3.exe", home_dir));
            // pyenv versions (检查具体版本)
            for version in &["3.13", "3.12", "3.11", "3.10", "3.9"] {
                for minor in 0..=20 {
                    commands.push(format!(r"{}\.pyenv\pyenv-win\versions\{}.{}\python.exe", home_dir, version, minor));
                }
            }
            
            // conda 路径
            commands.push(format!(r"{}\Anaconda3\python.exe", home_dir));
            commands.push(format!(r"{}\miniconda3\python.exe", home_dir));
            commands.push(format!(r"{}\anaconda3\python.exe", home_dir));
            commands.push(format!(r"{}\Miniconda3\python.exe", home_dir));
        }
    } else {
        // macOS/Linux: 基础命令
        commands.extend(vec![
            "python3".to_string(),
            "python".to_string(),
        ]);
        
        // macOS/Linux: 系统路径
        commands.extend(vec![
            "/usr/bin/python3".to_string(),
            "/usr/local/bin/python3".to_string(),
            "/opt/homebrew/bin/python3".to_string(),
        ]);
        
        // macOS/Linux: 多版本 Python
        for version in &["3.13", "3.12", "3.11", "3.10", "3.9", "3.8"] {
            commands.push(format!("/usr/bin/python{}", version));
            commands.push(format!("/usr/local/bin/python{}", version));
            commands.push(format!("/opt/homebrew/bin/python{}", version));
        }
        
        // macOS/Linux: pyenv 路径
        if !home_dir.is_empty() {
            // pyenv shims
            commands.push(format!("{}/.pyenv/shims/python", home_dir));
            commands.push(format!("{}/.pyenv/shims/python3", home_dir));
            // pyenv versions (检查具体版本)
            for version in &["3.13", "3.12", "3.11", "3.10", "3.9"] {
                for minor in 0..=20 {
                    commands.push(format!("{}/.pyenv/versions/{}.{}/bin/python", home_dir, version, minor));
                }
            }
            
            // conda 路径
            commands.push(format!("{}/anaconda3/bin/python", home_dir));
            commands.push(format!("{}/miniconda3/bin/python", home_dir));
            commands.push(format!("{}/mambaforge/bin/python", home_dir));
            commands.push(format!("{}/miniforge3/bin/python", home_dir));
            
            // asdf 路径
            commands.push(format!("{}/.asdf/shims/python", home_dir));
            commands.push(format!("{}/.asdf/shims/python3", home_dir));
        }
    }
    
    // 尝试每个命令
    for cmd in &commands {
        let result = std::process::Command::new(cmd)
            .arg("--version")
            .output();
        
        if let Ok(output) = result {
            if output.status.success() {
                return Ok(cmd.to_string());
            }
        }
    }
    
    // Windows 额外检查：通过 where 命令查找
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("where")
            .arg("python")
            .output()
        {
            if output.status.success() {
                let paths = String::from_utf8_lossy(&output.stdout);
                if let Some(first_path) = paths.lines().next() {
                    let path = first_path.trim();
                    if !path.is_empty() {
                        return Ok(path.to_string());
                    }
                }
            }
        }
    }
    
    // macOS/Linux 额外检查：通过 which 命令查找
    #[cfg(not(target_os = "windows"))]
    {
        for python_cmd in &["python3", "python"] {
            if let Ok(output) = std::process::Command::new("which")
                .arg(python_cmd)
                .output()
            {
                if output.status.success() {
                    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                    if !path.is_empty() {
                        return Ok(path);
                    }
                }
            }
        }
    }
    
    Err("未找到 Python，请安装 Python 3.x 或手动指定 Python 路径".to_string())
}

/// 获取 Python 版本信息
pub fn get_python_version(python_path: &str) -> Option<String> {
    let result = std::process::Command::new(python_path)
        .arg("--version")
        .output();
    
    if let Ok(output) = result {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if version.is_empty() {
                // 有些 Python 版本输出到 stderr
                return Some(String::from_utf8_lossy(&output.stderr).trim().to_string());
            }
            return Some(version);
        }
    }
    None
}

/// 获取脚本目录路径
pub fn get_scripts_dir() -> PathBuf {
    // 开发模式下，尝试多个可能的路径
    if cfg!(debug_assertions) {
        // 首先尝试当前目录
        let current_dir = PathBuf::from(".");
        if current_dir.join("auto.py").exists() {
            return current_dir;
        }
        
        // 尝试从 CARGO_MANIFEST_DIR 推断（编译时设置）
        // 运行时可能在 src-tauri 目录下
        let src_tauri_parent = PathBuf::from("..");
        if src_tauri_parent.join("auto.py").exists() {
            return src_tauri_parent;
        }
        
        // 尝试从可执行文件路径推断
        if let Ok(exe_path) = std::env::current_exe() {
            // 可执行文件通常在 src-tauri/target/debug/ 下
            if let Some(project_root) = exe_path.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
            {
                if project_root.join("auto.py").exists() {
                    return project_root.to_path_buf();
                }
            }
        }
        
        // 最后回退到用户数据目录
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".kiro-account-manager")
            .join("scripts")
    } else {
        // 生产模式下使用应用资源目录
        dirs::data_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".kiro-account-manager")
            .join("scripts")
    }
}

/// 获取脚本文件路径
pub fn get_script_path() -> PathBuf {
    get_scripts_dir().join("auto.py")
}

/// 获取默认脚本内容
pub fn get_default_script_content() -> &'static str {
    include_str!("../../auto.py")
}

/// 构建 Python 脚本参数
pub fn build_script_args(config: &AutoRegisterConfig) -> Vec<String> {
    let mut args = Vec::new();
    
    // 浏览器类型
    args.push("--browser-type".to_string());
    args.push(config.browser.browser_type.clone());
    
    // 注册数量和间隔
    args.push("--loop".to_string());
    args.push(config.execution.count.to_string());
    args.push("--interval".to_string());
    args.push(config.execution.interval.to_string());
    
    // Chrome 配置
    if config.browser.browser_type == "chrome" {
        if let Some(path) = &config.browser.chrome_path {
            args.push("--chrome-path".to_string());
            args.push(path.clone());
        }
        
        // 代理配置
        if config.proxy.enabled {
            args.push("--proxy-enabled".to_string());
            args.push("true".to_string());
            args.push("--proxy-type".to_string());
            args.push(config.proxy.proxy_type.clone());
            args.push("--proxy-host".to_string());
            args.push(config.proxy.host.clone());
            args.push("--proxy-port".to_string());
            args.push(config.proxy.port.to_string());
            
            if let Some(user) = &config.proxy.username {
                args.push("--proxy-user".to_string());
                args.push(user.clone());
            }
            if let Some(pass) = &config.proxy.password {
                args.push("--proxy-pass".to_string());
                args.push(pass.clone());
            }
        }
    } else {
        // Roxy 配置
        if let Some(port) = config.browser.roxy_port {
            args.push("--roxy-port".to_string());
            args.push(port.to_string());
        }
        if let Some(token) = &config.browser.roxy_token {
            args.push("--roxy-token".to_string());
            args.push(token.clone());
        }
    }
    
    args
}

/// 构建环境变量
pub fn build_script_env(config: &AutoRegisterConfig) -> Vec<(String, String)> {
    vec![
        ("EMAIL_IMAP_SERVER".to_string(), config.email.imap_server.clone()),
        ("EMAIL_ADDRESS".to_string(), config.email.email.clone()),
        ("EMAIL_PASSWORD".to_string(), config.email.password.clone()),
        ("EMAIL_PREFIX".to_string(), config.register.email_prefix.clone()),
        ("EMAIL_DOMAIN".to_string(), config.register.email_domain.clone()),
        ("EMAIL_TIMEOUT".to_string(), config.email.timeout.to_string()),
        ("EMAIL_POLL_INTERVAL".to_string(), config.email.poll_interval.to_string()),
    ]
}
