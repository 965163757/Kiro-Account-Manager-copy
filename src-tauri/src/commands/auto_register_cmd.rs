// 自动注册相关命令

use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
use crate::auto_register::{
    AutoRegisterConfig, AutoRegisterConfigStore, RegistrationProgress, RegistrationRecord,
    detect_chrome_path, detect_python, detect_python_with_path, get_python_version,
    build_chrome_args, build_script_args, build_script_env,
    get_scripts_dir, get_script_path, get_default_script_content,
    ProxyConfig, AUTO_REGISTER_STATE, AutoRegisterState,
};

/// 全局配置存储
static CONFIG_STORE: Mutex<Option<AutoRegisterConfigStore>> = Mutex::new(None);

fn get_store() -> std::sync::MutexGuard<'static, Option<AutoRegisterConfigStore>> {
    let mut store = CONFIG_STORE.lock().unwrap();
    if store.is_none() {
        *store = Some(AutoRegisterConfigStore::new());
    }
    store
}

// ============================================================
// 配置管理命令
// ============================================================

/// 获取自动注册配置
#[tauri::command]
pub fn get_auto_register_config() -> Result<AutoRegisterConfig, String> {
    let store = get_store();
    Ok(store.as_ref().unwrap().get_config())
}

/// 保存自动注册配置
#[tauri::command]
pub fn save_auto_register_config(config: AutoRegisterConfig) -> Result<(), String> {
    let mut store = get_store();
    store.as_mut().unwrap().save_config(config)
}

/// 测试邮箱连接
#[tauri::command(rename_all = "camelCase")]
pub async fn test_email_connection(
    imap_server: String,
    imap_port: u16,
    email: String,
    password: String,
    use_ssl: bool,
) -> Result<bool, String> {
    // 使用 Python 脚本测试连接
    let python = detect_python()?;
    
    // 将 Rust bool 转换为 Python bool 字符串
    let use_ssl_py = if use_ssl { "True" } else { "False" };
    
    let script = format!(
        r#"
import imaplib
import sys
try:
    if {use_ssl}:
        mail = imaplib.IMAP4_SSL("{server}", {port})
    else:
        mail = imaplib.IMAP4("{server}", {port})
    mail.login("{email}", "{password}")
    mail.logout()
    print("OK")
except Exception as e:
    print(f"ERROR: {{e}}")
    sys.exit(1)
"#,
        use_ssl = use_ssl_py,
        server = imap_server,
        port = imap_port,
        email = email,
        password = password
    );
    
    let output = tokio::process::Command::new(&python)
        .arg("-c")
        .arg(&script)
        .output()
        .await
        .map_err(|e| format!("执行测试脚本失败: {}", e))?;
    
    if output.status.success() {
        Ok(true)
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        Err(format!("连接失败: {} {}", stdout, stderr))
    }
}

/// 测试代理连接
#[tauri::command]
pub async fn test_proxy_connection(config: ProxyConfig) -> Result<bool, String> {
    if !config.enabled {
        return Ok(true);
    }
    
    let proxy_url = match config.proxy_type.as_str() {
        "socks5" => format!("socks5://{}:{}", config.host, config.port),
        "https" => format!("https://{}:{}", config.host, config.port),
        _ => format!("http://{}:{}", config.host, config.port),
    };
    
    let client = reqwest::Client::builder()
        .proxy(reqwest::Proxy::all(&proxy_url).map_err(|e| format!("代理配置错误: {}", e))?)
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("创建客户端失败: {}", e))?;
    
    client
        .get("https://www.google.com")
        .send()
        .await
        .map_err(|e| format!("代理连接失败: {}", e))?;
    
    Ok(true)
}

// ============================================================
// 浏览器相关命令
// ============================================================

/// 检测 Chrome 路径
#[tauri::command]
pub fn detect_chrome() -> Result<String, String> {
    detect_chrome_path().ok_or_else(|| "未找到 Chrome 浏览器".to_string())
}

/// 检测 Python 环境
#[tauri::command]
pub fn detect_python_env(custom_path: Option<String>) -> Result<serde_json::Value, String> {
    let path = detect_python_with_path(custom_path.as_deref())?;
    let version = get_python_version(&path);
    
    Ok(serde_json::json!({
        "path": path,
        "version": version
    }))
}

/// 检测所有可用的 Python 版本（异步执行，避免阻塞 UI）
#[tauri::command]
pub async fn detect_all_python_versions() -> Result<serde_json::Value, String> {
    // 在后台线程执行耗时操作
    tokio::task::spawn_blocking(|| {
        detect_all_python_versions_sync()
    })
    .await
    .map_err(|e| format!("检测 Python 失败: {}", e))?
}

/// 同步检测所有可用的 Python 版本（内部函数）
fn detect_all_python_versions_sync() -> Result<serde_json::Value, String> {
    use std::collections::HashMap;
    
    // 使用 HashMap 按版本号去重，保留最短路径
    let mut version_map: HashMap<String, String> = HashMap::new();
    
    // 辅助函数：添加 Python 到结果中
    let mut add_python = |path: &str| {
        if let Some(version) = get_python_version_fast(path) {
            // 提取主版本号用于去重 (e.g., "Python 3.12.0" -> "3.12")
            let major_version = extract_major_version(&version);
            
            // 如果这个主版本还没有，或者当前路径更短，就使用这个
            let should_add = match version_map.get(&major_version) {
                None => true,
                Some(existing_path) => path.len() < existing_path.len(),
            };
            
            if should_add {
                version_map.insert(major_version, path.to_string());
            }
        }
    };
    
    // Windows: 使用 where 命令
    #[cfg(target_os = "windows")]
    {
        for cmd in &["python", "python3", "py"] {
            if let Ok(output) = std::process::Command::new("where")
                .arg(cmd)
                .creation_flags(0x08000000)
                .output()
            {
                if output.status.success() {
                    let paths = String::from_utf8_lossy(&output.stdout);
                    for line in paths.lines() {
                        let path = line.trim();
                        if !path.is_empty() {
                            add_python(path);
                        }
                    }
                }
            }
        }
    }
    
    // macOS/Linux: 使用 which 命令
    #[cfg(not(target_os = "windows"))]
    {
        for cmd in &["python3", "python"] {
            if let Ok(output) = std::process::Command::new("which")
                .arg("-a")
                .arg(cmd)
                .output()
            {
                if output.status.success() {
                    let paths = String::from_utf8_lossy(&output.stdout);
                    for line in paths.lines() {
                        let path = line.trim();
                        if !path.is_empty() {
                            add_python(path);
                        }
                    }
                }
            }
        }
    }
    
    // 转换为结果数组，并按版本号排序（新版本在前）
    let mut pythons: Vec<serde_json::Value> = version_map
        .into_iter()
        .map(|(major_version, path)| {
            // 重新获取完整版本信息
            let version = get_python_version_fast(&path).unwrap_or_else(|| format!("Python {}", major_version));
            serde_json::json!({
                "path": path,
                "version": version
            })
        })
        .collect();
    
    // 按版本排序（降序，新版本在前）
    pythons.sort_by(|a, b| {
        let va = a["version"].as_str().unwrap_or("");
        let vb = b["version"].as_str().unwrap_or("");
        vb.cmp(va)
    });
    
    Ok(serde_json::json!({
        "pythons": pythons,
        "count": pythons.len()
    }))
}

/// 提取主版本号 (e.g., "Python 3.12.0" -> "3.12")
fn extract_major_version(version: &str) -> String {
    // 尝试匹配 "Python X.Y.Z" 或 "Python X.Y"
    let version = version.trim();
    if let Some(rest) = version.strip_prefix("Python ") {
        let parts: Vec<&str> = rest.split('.').collect();
        if parts.len() >= 2 {
            return format!("{}.{}", parts[0], parts[1]);
        } else if !parts.is_empty() {
            return parts[0].to_string();
        }
    }
    // 回退：返回整个版本字符串
    version.to_string()
}

/// 快速获取 Python 版本
fn get_python_version_fast(python_path: &str) -> Option<String> {
    #[cfg(target_os = "windows")]
    let result = std::process::Command::new(python_path)
        .arg("--version")
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .output();
    
    #[cfg(not(target_os = "windows"))]
    let result = std::process::Command::new(python_path)
        .arg("--version")
        .output();
    
    if let Ok(output) = result {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if version.is_empty() {
                let stderr_version = String::from_utf8_lossy(&output.stderr).trim().to_string();
                if !stderr_version.is_empty() {
                    return Some(stderr_version);
                }
                return None;
            }
            return Some(version);
        }
    }
    None
}

/// 启动 Chrome 隐私模式
#[tauri::command]
pub async fn launch_chrome_incognito(
    url: String,
    chrome_path: Option<String>,
    proxy: Option<ProxyConfig>,
) -> Result<u32, String> {
    let path = chrome_path
        .or_else(detect_chrome_path)
        .ok_or_else(|| "未找到 Chrome 浏览器，请手动指定路径".to_string())?;
    
    let (args, debug_port) = build_chrome_args(&url, proxy.as_ref());
    
    let mut cmd = tokio::process::Command::new(&path);
    cmd.args(&args);
    
    let _child = cmd
        .spawn()
        .map_err(|e| format!("启动 Chrome 失败: {}", e))?;
    
    // 返回调试端口
    Ok(debug_port as u32)
}

/// 检查 Roxy 服务状态
#[tauri::command]
pub async fn check_roxy_service(port: Option<u16>, token: Option<String>) -> Result<bool, String> {
    let port = port.unwrap_or(50000);
    let url = format!("http://127.0.0.1:{}/health", port);
    
    let mut headers = reqwest::header::HeaderMap::new();
    headers.insert("Content-Type", "application/json".parse().unwrap());
    if let Some(t) = token {
        headers.insert("token", t.parse().map_err(|_| "无效的 token")?);
    }
    
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .headers(headers)
        .timeout(std::time::Duration::from_secs(5))
        .send()
        .await
        .map_err(|_| "Roxy 服务未运行")?;
    
    if response.status().is_success() {
        Ok(true)
    } else {
        Err("Roxy 服务响应异常".to_string())
    }
}

// ============================================================
// 执行控制命令
// ============================================================

/// 获取注册进度
#[tauri::command]
pub fn get_registration_progress() -> RegistrationProgress {
    let state = AUTO_REGISTER_STATE.lock().unwrap();
    if let Some(s) = state.as_ref() {
        // 正确判断状态：error > completed > running > idle
        let status = if s.error.is_some() {
            "error".to_string()
        } else if s.is_running {
            "running".to_string()
        } else if s.total_count > 0 {
            // 如果有任务执行过且没有错误，则为完成状态
            "completed".to_string()
        } else {
            "idle".to_string()
        };
        
        RegistrationProgress {
            status,
            current_step: s.current_step.clone(),
            current_index: s.current_index,
            total_count: s.total_count,
            logs: s.logs.clone(),
            error: s.error.clone(),
        }
    } else {
        RegistrationProgress::default()
    }
}

/// 启动自动注册
#[tauri::command]
pub async fn start_auto_register(app_handle: AppHandle, count: Option<u32>, interval: Option<u32>) -> Result<String, String> {
    // 检查是否已在运行
    {
        let state = AUTO_REGISTER_STATE.lock().unwrap();
        if let Some(s) = state.as_ref() {
            if s.is_running {
                return Err("注册任务已在运行中".to_string());
            }
        }
    }
    
    // 获取配置
    let mut config = {
        let store = get_store();
        store.as_ref().unwrap().get_config()
    };
    
    // 调试：打印配置信息
    {
        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
        if let Some(s) = state.as_mut() {
            s.logs.push(format!("[调试] 邮箱配置: IMAP={}, Email={}", 
                config.email.imap_server, config.email.email));
        }
    }
    let _ = app_handle.emit("auto-register-progress", get_registration_progress());
    
    // 使用传入的参数覆盖配置
    if let Some(c) = count {
        config.execution.count = c;
    }
    if let Some(i) = interval {
        config.execution.interval = i;
    }
    
    // 检测 Python - 使用配置中的路径或自动检测
    let python = if config.python.auto_detect {
        detect_python_with_path(None)?
    } else {
        detect_python_with_path(config.python.python_path.as_deref())?
    };
    
    // 初始化状态
    {
        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
        *state = Some(AutoRegisterState {
            is_running: true,
            should_stop: false,
            current_index: 0,
            total_count: config.execution.count,
            current_step: "准备中...".to_string(),
            logs: vec![
                format!("使用 Python: {}", python),
                "开始自动注册流程".to_string()
            ],
            error: None,
            pending_email: None,
        });
    }
    
    // 发送进度更新事件
    let _ = app_handle.emit("auto-register-progress", get_registration_progress());
    
    // 获取脚本目录和路径
    let scripts_dir = get_scripts_dir();
    let script_path = scripts_dir.join("auto.py");
    
    // 如果脚本不存在，从内嵌资源创建
    if !script_path.exists() {
        // 确保目录存在
        if let Err(e) = std::fs::create_dir_all(&scripts_dir) {
            let mut state = AUTO_REGISTER_STATE.lock().unwrap();
            if let Some(s) = state.as_mut() {
                s.is_running = false;
                s.error = Some(format!("创建脚本目录失败: {}", e));
                s.logs.push(format!("错误: 创建脚本目录失败: {}", e));
            }
            let _ = app_handle.emit("auto-register-progress", get_registration_progress());
            return Err(format!("创建脚本目录失败: {}", e));
        }
        
        // 从内嵌资源写入脚本
        let default_content = get_default_script_content();
        if let Err(e) = std::fs::write(&script_path, default_content) {
            let mut state = AUTO_REGISTER_STATE.lock().unwrap();
            if let Some(s) = state.as_mut() {
                s.is_running = false;
                s.error = Some(format!("写入脚本文件失败: {}", e));
                s.logs.push(format!("错误: 写入脚本文件失败: {}", e));
            }
            let _ = app_handle.emit("auto-register-progress", get_registration_progress());
            return Err(format!("写入脚本文件失败: {}", e));
        }
        
        // 记录日志
        {
            let mut state = AUTO_REGISTER_STATE.lock().unwrap();
            if let Some(s) = state.as_mut() {
                s.logs.push(format!("已自动创建脚本: {:?}", script_path));
            }
        }
        let _ = app_handle.emit("auto-register-progress", get_registration_progress());
    }
    
    // 再次验证脚本存在
    if !script_path.exists() {
        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
        if let Some(s) = state.as_mut() {
            s.is_running = false;
            s.error = Some(format!("脚本文件不存在: {:?}", script_path));
            s.logs.push(format!("错误: 脚本文件仍不存在"));
        }
        let _ = app_handle.emit("auto-register-progress", get_registration_progress());
        return Err(format!("脚本文件不存在: {:?}", script_path));
    }
    
    // 获取绝对路径用于日志（移除 Windows 的 \\?\ 前缀）
    let script_path_abs = script_path.canonicalize().unwrap_or_else(|_| script_path.clone());
    let script_path_abs = PathBuf::from(
        script_path_abs.to_string_lossy()
            .trim_start_matches(r"\\?\")
            .to_string()
    );
    
    let args = build_script_args(&config);
    let env_vars = build_script_env(&config);
    
    // 记录启动信息和环境变量
    {
        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
        if let Some(s) = state.as_mut() {
            s.logs.push(format!("脚本路径: {:?}", script_path_abs));
            s.logs.push(format!("工作目录: {:?}", script_path_abs.parent().unwrap_or(&script_path_abs)));
            s.logs.push(format!("参数: {:?}", args));
            s.logs.push(format!("环境变量数量: {}", env_vars.len()));
            // 记录环境变量（隐藏密码）
            for (key, value) in &env_vars {
                if key.contains("PASSWORD") {
                    s.logs.push(format!("  {}=***", key));
                } else {
                    s.logs.push(format!("  {}={}", key, value));
                }
            }
        }
    }
    let _ = app_handle.emit("auto-register-progress", get_registration_progress());
    
    // 在后台线程执行
    let app_handle_clone = app_handle.clone();
    let script_path_for_spawn = script_path_abs.clone();
    tokio::spawn(async move {
        let mut cmd = tokio::process::Command::new(&python);
        // 使用 -u 禁用 Python 输出缓冲
        cmd.arg("-u");
        cmd.arg(&script_path_for_spawn);
        cmd.args(&args);
        
        // 设置 PYTHONUNBUFFERED 环境变量确保输出不被缓冲
        cmd.env("PYTHONUNBUFFERED", "1");
        cmd.env("PYTHONIOENCODING", "utf-8");
        
        for (key, value) in env_vars {
            cmd.env(key, value);
        }
        
        // 设置工作目录为脚本所在目录（使用绝对路径）
        if let Some(parent) = script_path_for_spawn.parent() {
            cmd.current_dir(parent);
        }
        
        // 捕获输出
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        
        // Windows: 添加 CREATE_NO_WINDOW 标志，避免弹出控制台窗口导致阻塞
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        
        match cmd.spawn() {
            Ok(mut child) => {
                // 同时读取 stdout 和 stderr
                let stdout = child.stdout.take();
                let stderr = child.stderr.take();
                
                // 使用 channel 来收集日志，避免死锁
                let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
                let tx_stderr = tx.clone();
                
                // 创建一个任务来读取 stderr
                let stderr_task = tokio::spawn(async move {
                    if let Some(stderr) = stderr {
                        let reader = tokio::io::BufReader::new(stderr);
                        let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
                        
                        while let Ok(Some(line)) = lines.next_line().await {
                            let _ = tx_stderr.send(format!("[stderr] {}", line));
                        }
                    }
                });
                
                // 创建一个任务来读取 stdout
                let stdout_task = tokio::spawn(async move {
                    if let Some(stdout) = stdout {
                        let reader = tokio::io::BufReader::new(stdout);
                        let mut lines = tokio::io::AsyncBufReadExt::lines(reader);
                        
                        while let Ok(Some(line)) = lines.next_line().await {
                            let _ = tx.send(line);
                        }
                    }
                });
                
                // 用于跟踪是否被用户停止
                let mut user_stopped = false;
                
                // 主循环：处理日志并更新状态
                loop {
                    tokio::select! {
                        // 接收日志消息
                        msg = rx.recv() => {
                            match msg {
                                Some(line) => {
                                    let should_stop = {
                                        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                                        if let Some(s) = state.as_mut() {
                                            s.logs.push(line.clone());
                                            if !line.starts_with("[stderr]") {
                                                s.current_step = line.clone();
                                            }
                                            s.should_stop
                                        } else {
                                            false
                                        }
                                    };
                                    
                                    // 检查是否是注册成功的日志，解析邮箱和密码
                                    // 格式: "邮箱: xxx@xxx.com" 和 "密码: xxx"
                                    if line.starts_with("邮箱: ") {
                                        let email = line.trim_start_matches("邮箱: ").trim().to_string();
                                        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                                        if let Some(s) = state.as_mut() {
                                            // 使用 pending_email 存储邮箱，不会被 current_step 覆盖
                                            s.pending_email = Some(email.clone());
                                            s.logs.push(format!("[系统] 检测到注册邮箱: {}", email));
                                        }
                                    } else if line.starts_with("密码: ") {
                                        let password = line.trim_start_matches("密码: ").trim().to_string();
                                        // 获取之前存储的邮箱
                                        let email = {
                                            let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                                            if let Some(s) = state.as_mut() {
                                                s.pending_email.take() // 取出并清空
                                            } else {
                                                None
                                            }
                                        };
                                        
                                        // 保存到历史记录
                                        if let Some(email) = email {
                                            let record = RegistrationRecord::new(
                                                email.clone(),
                                                password.clone(),
                                                "success".to_string()
                                            );
                                            let mut store = get_store();
                                            store.as_mut().unwrap().add_record(record);
                                            
                                            // 添加日志
                                            let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                                            if let Some(s) = state.as_mut() {
                                                s.logs.push(format!("[系统] 已保存注册记录: {}", email));
                                            }
                                        } else {
                                            // 未找到对应的邮箱
                                            let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                                            if let Some(s) = state.as_mut() {
                                                s.logs.push("[系统] 警告: 检测到密码但未找到对应邮箱".to_string());
                                            }
                                        }
                                    }
                                    
                                    // 发送进度更新（在锁释放后）
                                    let _ = app_handle_clone.emit("auto-register-progress", get_registration_progress());
                                    
                                    if should_stop {
                                        let _ = child.kill().await;
                                        user_stopped = true;
                                        {
                                            let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                                            if let Some(s) = state.as_mut() {
                                                s.is_running = false;
                                                s.logs.push("注册已停止".to_string());
                                            }
                                        }
                                        let _ = app_handle_clone.emit("auto-register-progress", get_registration_progress());
                                        break;
                                    }
                                }
                                None => {
                                    // channel 关闭，说明两个读取任务都完成了
                                    break;
                                }
                            }
                        }
                    }
                }
                
                // 等待读取任务完成
                let _ = stdout_task.await;
                let _ = stderr_task.await;
                
                // 如果不是用户停止的，等待进程结束并更新状态
                if !user_stopped {
                    let status = child.wait().await;
                    
                    // 更新最终状态
                    {
                        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                        if let Some(s) = state.as_mut() {
                            s.is_running = false;
                            if let Ok(status) = status {
                                if status.success() {
                                    s.logs.push("注册流程完成".to_string());
                                    s.current_step = "注册完成".to_string();
                                } else {
                                    let exit_code = status.code().map(|c| c.to_string()).unwrap_or("unknown".to_string());
                                    s.error = Some(format!("脚本执行失败，退出码: {}", exit_code));
                                    s.logs.push(format!("注册流程失败，退出码: {}", exit_code));
                                }
                            } else {
                                s.error = Some("无法获取进程状态".to_string());
                            }
                        }
                    }
                    
                    let _ = app_handle_clone.emit("auto-register-progress", get_registration_progress());
                }
            }
            Err(e) => {
                let mut state = AUTO_REGISTER_STATE.lock().unwrap();
                if let Some(s) = state.as_mut() {
                    s.is_running = false;
                    s.error = Some(format!("启动脚本失败: {}", e));
                    s.logs.push(format!("启动脚本失败: {}", e));
                }
                let _ = app_handle_clone.emit("auto-register-progress", get_registration_progress());
            }
        }
    });
    
    Ok("注册任务已启动".to_string())
}

/// 停止自动注册
#[tauri::command]
pub fn stop_auto_register() -> Result<(), String> {
    let mut state = AUTO_REGISTER_STATE.lock().unwrap();
    if let Some(s) = state.as_mut() {
        if s.is_running {
            s.should_stop = true;
            s.logs.push("正在停止注册...".to_string());
            Ok(())
        } else {
            Err("没有正在运行的注册任务".to_string())
        }
    } else {
        Err("没有正在运行的注册任务".to_string())
    }
}

/// 重置自动注册状态（清除错误状态，允许重新开始）
#[tauri::command]
pub fn reset_auto_register_state() -> Result<(), String> {
    let mut state = AUTO_REGISTER_STATE.lock().unwrap();
    if let Some(s) = state.as_ref() {
        if s.is_running {
            return Err("任务正在运行中，无法重置".to_string());
        }
    }
    *state = None;
    Ok(())
}

// ============================================================
// 历史记录命令
// ============================================================

/// 获取注册历史
#[tauri::command]
pub fn get_registration_history() -> Vec<RegistrationRecord> {
    let store = get_store();
    store.as_ref().unwrap().get_history()
}

/// 添加注册记录
#[tauri::command]
pub fn add_registration_record(
    email: String,
    password: String,
    status: String,
    error: Option<String>,
    account_id: Option<String>,
) -> Result<RegistrationRecord, String> {
    let mut record = RegistrationRecord::new(email, password, status);
    record.error = error;
    record.account_id = account_id;
    
    let mut store = get_store();
    store.as_mut().unwrap().add_record(record.clone());
    
    Ok(record)
}

/// 清除注册历史
#[tauri::command]
pub fn clear_registration_history() -> Result<(), String> {
    let mut store = get_store();
    store.as_mut().unwrap().clear_history();
    Ok(())
}

/// 导出注册历史
#[tauri::command]
pub fn export_registration_history(path: String) -> Result<(), String> {
    let store = get_store();
    store.as_ref().unwrap().export_history(&path)
}

// ============================================================
// 脚本管理命令
// ============================================================

/// 获取脚本内容
#[tauri::command]
pub fn get_script_content() -> Result<String, String> {
    let script_path = get_script_path();
    
    if script_path.exists() {
        std::fs::read_to_string(&script_path)
            .map_err(|e| format!("读取脚本失败: {}", e))
    } else {
        // 返回默认脚本内容
        Ok(get_default_script_content().to_string())
    }
}

/// 保存脚本内容
#[tauri::command]
pub fn save_script_content(content: String) -> Result<(), String> {
    let script_path = get_script_path();
    
    // 确保目录存在
    if let Some(parent) = script_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    
    std::fs::write(&script_path, content)
        .map_err(|e| format!("保存脚本失败: {}", e))
}

/// 获取脚本路径
#[tauri::command]
pub fn get_script_path_cmd() -> String {
    get_script_path().to_string_lossy().to_string()
}

/// 重置脚本为默认内容
#[tauri::command]
pub fn reset_script_to_default() -> Result<String, String> {
    let script_path = get_script_path();
    let default_content = get_default_script_content();
    
    // 确保目录存在
    if let Some(parent) = script_path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("创建目录失败: {}", e))?;
    }
    
    std::fs::write(&script_path, default_content)
        .map_err(|e| format!("重置脚本失败: {}", e))?;
    
    Ok(default_content.to_string())
}

/// 在文件管理器中打开脚本所在目录
#[tauri::command]
pub fn open_script_folder() -> Result<(), String> {
    let script_path = get_script_path();
    let folder = script_path.parent().unwrap_or(&script_path);
    
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(folder)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }
    
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(folder)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }
    
    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(folder)
            .spawn()
            .map_err(|e| format!("打开文件夹失败: {}", e))?;
    }
    
    Ok(())
}
