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
    use std::collections::HashSet;
    
    let home_dir = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    
    let mut found_pythons: Vec<(String, String)> = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();
    
    // Windows: 优先使用 where 命令快速获取 PATH 中的 Python
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = std::process::Command::new("where")
            .arg("python")
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
        {
            if output.status.success() {
                let paths = String::from_utf8_lossy(&output.stdout);
                for line in paths.lines().take(5) { // 最多取5个
                    let path = line.trim().to_string();
                    if !path.is_empty() && !seen_paths.contains(&path) {
                        if let Some(version) = get_python_version_fast(&path) {
                            seen_paths.insert(path.clone());
                            found_pythons.push((path, version));
                        }
                    }
                }
            }
        }
        
        // where python3
        if let Ok(output) = std::process::Command::new("where")
            .arg("python3")
            .creation_flags(0x08000000)
            .output()
        {
            if output.status.success() {
                let paths = String::from_utf8_lossy(&output.stdout);
                for line in paths.lines().take(3) {
                    let path = line.trim().to_string();
                    if !path.is_empty() && !seen_paths.contains(&path) {
                        if let Some(version) = get_python_version_fast(&path) {
                            seen_paths.insert(path.clone());
                            found_pythons.push((path, version));
                        }
                    }
                }
            }
        }
    }
    
    // macOS/Linux: 使用 which 命令
    #[cfg(not(target_os = "windows"))]
    {
        for python_cmd in &["python3", "python"] {
            if let Ok(output) = std::process::Command::new("which")
                .arg("-a")
                .arg(python_cmd)
                .output()
            {
                if output.status.success() {
                    let paths = String::from_utf8_lossy(&output.stdout);
                    for line in paths.lines().take(5) {
                        let path = line.trim().to_string();
                        if !path.is_empty() && !seen_paths.contains(&path) {
                            if let Some(version) = get_python_version_fast(&path) {
                                seen_paths.insert(path.clone());
                                found_pythons.push((path, version));
                            }
                        }
                    }
                }
            }
        }
    }
    
    // 检查常见安装路径（仅检查文件存在性，不执行命令）
    let mut candidates: Vec<String> = Vec::new();
    
    if cfg!(target_os = "windows") {
        // Windows: 常见安装路径
        for version in &["313", "312", "311", "310", "39"] {
            let path = format!(r"C:\Python{}\python.exe", version);
            if std::path::Path::new(&path).exists() {
                candidates.push(path);
            }
            
            if !home_dir.is_empty() {
                let path = format!(r"{}\AppData\Local\Programs\Python\Python{}\python.exe", home_dir, version);
                if std::path::Path::new(&path).exists() {
                    candidates.push(path);
                }
            }
        }
        
        // conda
        if !home_dir.is_empty() {
            for conda_dir in &["Anaconda3", "miniconda3", "anaconda3", "Miniconda3"] {
                let path = format!(r"{}\{}\python.exe", home_dir, conda_dir);
                if std::path::Path::new(&path).exists() {
                    candidates.push(path);
                }
            }
        }
    } else {
        // macOS/Linux: 检查常见路径
        let paths = [
            "/usr/bin/python3",
            "/usr/local/bin/python3",
            "/opt/homebrew/bin/python3",
        ];
        for path in &paths {
            if std::path::Path::new(path).exists() && !seen_paths.contains(*path) {
                candidates.push(path.to_string());
            }
        }
        
        // pyenv
        if !home_dir.is_empty() {
            let pyenv_path = format!("{}/.pyenv/shims/python3", home_dir);
            if std::path::Path::new(&pyenv_path).exists() {
                candidates.push(pyenv_path);
            }
            
            // conda
            for conda_dir in &["anaconda3", "miniconda3", "mambaforge", "miniforge3"] {
                let path = format!("{}/{}/bin/python", home_dir, conda_dir);
                if std::path::Path::new(&path).exists() {
                    candidates.push(path);
                }
            }
        }
    }
    
    // 检测候选路径（已确认存在的文件）
    for cmd in candidates {
        if seen_paths.contains(&cmd) {
            continue;
        }
        
        if let Some(version) = get_python_version_fast(&cmd) {
            seen_paths.insert(cmd.clone());
            found_pythons.push((cmd, version));
        }
    }
    
    // 转换为 JSON 数组
    let pythons: Vec<serde_json::Value> = found_pythons
        .into_iter()
        .map(|(path, version)| {
            serde_json::json!({
                "path": path,
                "version": version
            })
        })
        .collect();
    
    Ok(serde_json::json!({
        "pythons": pythons,
        "count": pythons.len()
    }))
}

/// 快速获取 Python 版本（带超时）
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
                return Some(String::from_utf8_lossy(&output.stderr).trim().to_string());
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
    
    // 构建脚本参数
    let script_path = get_scripts_dir().join("auto.py");
    
    // 获取绝对路径用于日志（移除 Windows 的 \\?\ 前缀）
    let script_path_abs = script_path.canonicalize().unwrap_or_else(|_| script_path.clone());
    let script_path_abs = PathBuf::from(
        script_path_abs.to_string_lossy()
            .trim_start_matches(r"\\?\")
            .to_string()
    );
    
    // 检查脚本是否存在
    if !script_path.exists() {
        // 尝试列出可能的位置
        let mut possible_paths = vec![
            PathBuf::from(".").join("auto.py"),
            PathBuf::from("..").join("auto.py"),
        ];
        
        if let Ok(exe_path) = std::env::current_exe() {
            if let Some(project_root) = exe_path.parent()
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
                .and_then(|p| p.parent())
            {
                possible_paths.push(project_root.join("auto.py"));
            }
        }
        
        let mut state = AUTO_REGISTER_STATE.lock().unwrap();
        if let Some(s) = state.as_mut() {
            s.is_running = false;
            s.error = Some(format!("脚本文件不存在: {:?}", script_path_abs));
            s.logs.push(format!("错误: 脚本文件不存在"));
            s.logs.push(format!("查找路径: {:?}", script_path_abs));
            s.logs.push(format!("当前工作目录: {:?}", std::env::current_dir().unwrap_or_default()));
            
            // 列出尝试过的路径
            for p in &possible_paths {
                let exists = p.exists();
                s.logs.push(format!("尝试路径: {:?} - {}", p, if exists { "存在" } else { "不存在" }));
            }
        }
        let _ = app_handle.emit("auto-register-progress", get_registration_progress());
        return Err(format!("脚本文件不存在: {:?}", script_path_abs));
    }
    
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
