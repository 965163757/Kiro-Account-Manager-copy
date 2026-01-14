// HTTP 服务器 - 暴露设备授权 URL 给外部脚本

use std::io::{Read, Write};
use std::net::TcpListener;
use std::thread;
use crate::state::{CURRENT_DEVICE_AUTH_URL, PENDING_DEVICE_AUTH, PendingDeviceAuth};
use crate::aws_sso_client::{AWSSSOClient, DevicePollResult};
use crate::codewhisperer_client::CodeWhispererClient;
use crate::account::{Account, AccountStore};
use crate::kiro::{get_machine_id, reset_kiro_machine_id_inner};
use sha2::{Digest, Sha256};

const HTTP_PORT: u16 = 23847;

/// 启动 HTTP 服务器（在后台线程运行）
pub fn start_http_server() {
    thread::spawn(|| {
        let addr = format!("127.0.0.1:{}", HTTP_PORT);
        let listener = match TcpListener::bind(&addr) {
            Ok(l) => l,
            Err(e) => {
                eprintln!("[HTTP Server] Failed to bind to {}: {}", addr, e);
                return;
            }
        };

        println!("[HTTP Server] Listening on http://{}", addr);

        // 创建 tokio runtime 用于异步操作
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");

        for stream in listener.incoming() {
            match stream {
                Ok(mut stream) => {
                    let mut buffer = [0; 1024];
                    if stream.read(&mut buffer).is_ok() {
                        let request = String::from_utf8_lossy(&buffer);

                        // GET /get_device_auth_url - 获取当前授权 URL
                        if request.starts_with("GET /get_device_auth_url") {
                            let url = CURRENT_DEVICE_AUTH_URL.lock().unwrap().clone();
                            let json = match url {
                                Some(u) => format!(r#"{{"url":"{}"}}"#, u),
                                None => r#"{"url":null}"#.to_string(),
                            };

                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(response.as_bytes());
                        }
                        // POST/GET /start_device_auth - 触发设备授权流程
                        else if request.starts_with("POST /start_device_auth") || request.starts_with("GET /start_device_auth") {
                            let result = rt.block_on(async {
                                start_device_auth_internal().await
                            });

                            let (status, json) = match result {
                                Ok(info) => ("200 OK", format!(
                                    r#"{{"success":true,"url":"{}","device_code":"{}","expires_in":{},"interval":{}}}"#,
                                    info.0, info.1, info.2, info.3
                                )),
                                Err(e) => ("500 Internal Server Error", format!(r#"{{"success":false,"error":"{}"}}"#, e.replace('"', "\\\""))),
                            };

                            let response = format!(
                                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                status,
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(response.as_bytes());
                        }
                        // POST/GET /poll_device_auth - 轮询设备授权状态
                        else if request.starts_with("POST /poll_device_auth") || request.starts_with("GET /poll_device_auth") {
                            let result = rt.block_on(async {
                                poll_device_auth_internal().await
                            });

                            let (status, json) = match result {
                                Ok(poll_result) => ("200 OK", poll_result),
                                Err(e) => ("500 Internal Server Error", format!(r#"{{"status":"error","error":"{}"}}"#, e.replace('"', "\\\""))),
                            };

                            let response = format!(
                                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                status,
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(response.as_bytes());
                        }
                        // GET /status - 获取服务状态
                        else if request.starts_with("GET /status") {
                            let json = r#"{"status":"running","version":"1.5.1"}"#;
                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(response.as_bytes());
                        }
                        // GET /reload_accounts - 重新加载账号（通知前端刷新）
                        else if request.starts_with("GET /reload_accounts") || request.starts_with("POST /reload_accounts") {
                            // 重新加载账号存储
                            let store = AccountStore::new();
                            let count = store.accounts.len();
                            let json = format!(r#"{{"success":true,"count":{}}}"#, count);
                            let response = format!(
                                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(response.as_bytes());
                            println!("[HTTP Server] Accounts reloaded: {} accounts", count);
                        }
                        // GET/POST /reset_machine_id - 重置机器码
                        else if request.starts_with("GET /reset_machine_id") || request.starts_with("POST /reset_machine_id") {
                            let result = reset_kiro_machine_id_inner();
                            let (status, json) = match result {
                                Ok(info) => {
                                    let machine_id = info.machine_id.unwrap_or_default();
                                    println!("[HTTP Server] Machine ID reset to: {}", &machine_id[..16.min(machine_id.len())]);
                                    ("200 OK", format!(
                                        r#"{{"success":true,"machineId":"{}","sqmId":"{}","devDeviceId":"{}"}}"#,
                                        machine_id,
                                        info.sqm_id.unwrap_or_default(),
                                        info.dev_device_id.unwrap_or_default()
                                    ))
                                }
                                Err(e) => ("500 Internal Server Error", format!(r#"{{"success":false,"error":"{}"}}"#, e.replace('"', "\\\""))),
                            };
                            let response = format!(
                                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                status,
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(response.as_bytes());
                        }
                        else {
                            // 404 for other paths
                            let json = r#"{"error":"Not Found","endpoints":["/get_device_auth_url","/start_device_auth","/poll_device_auth","/reload_accounts","/reset_machine_id","/status"]}"#;
                            let response = format!(
                                "HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nAccess-Control-Allow-Origin: *\r\nContent-Length: {}\r\n\r\n{}",
                                json.len(),
                                json
                            );
                            let _ = stream.write_all(response.as_bytes());
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[HTTP Server] Connection error: {}", e);
                }
            }
        }
    });
}

/// 内部函数：触发设备授权流程
/// 返回 (url, device_code, expires_in, interval)
/// 同时启动后台轮询线程，模拟手动点击 "AWS Builder ID" 的行为
async fn start_device_auth_internal() -> Result<(String, String, i64, i64), String> {
    let region = "us-east-1";
    let start_url = "https://view.awsapps.com/start";

    println!("[HTTP Server] Starting device authorization...");

    let sso_client = AWSSSOClient::new(region);

    // Step 1: 注册客户端
    let client_reg = sso_client.register_device_client(start_url).await?;
    println!("[HTTP Server] Client registered: {}", &client_reg.client_id);

    // Step 2: 发起设备授权
    let device_auth = sso_client.start_device_authorization(
        &client_reg.client_id,
        &client_reg.client_secret,
        start_url,
    ).await?;

    let url = device_auth.verification_uri_complete.clone()
        .unwrap_or_else(|| device_auth.verification_uri.clone());

    println!("[HTTP Server] Device auth URL: {}", url);
    println!("[HTTP Server] User Code: {}", device_auth.user_code);
    println!("[HTTP Server] Device Code: {}", device_auth.device_code);

    // 计算过期时间
    let expires_at = chrono::Utc::now().timestamp() + device_auth.expires_in;
    let interval = device_auth.interval.unwrap_or(5);

    // 保存待处理的设备授权信息
    *PENDING_DEVICE_AUTH.lock().unwrap() = Some(PendingDeviceAuth {
        device_code: device_auth.device_code.clone(),
        client_id: client_reg.client_id.clone(),
        client_secret: client_reg.client_secret.clone(),
        region: region.to_string(),
        expires_at,
    });

    // 更新全局 URL
    *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = Some(url.clone());

    // 启动后台轮询线程（模拟手动点击 "AWS Builder ID" 的行为）
    let client_id = client_reg.client_id.clone();
    let client_secret = client_reg.client_secret.clone();
    let device_code = device_auth.device_code.clone();
    let poll_interval = interval as u64;
    let poll_expires_in = device_auth.expires_in;

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime");
        rt.block_on(async {
            background_poll_device_auth(
                client_id,
                client_secret,
                device_code,
                region.to_string(),
                poll_interval,
                poll_expires_in,
            ).await;
        });
    });

    Ok((url, device_auth.device_code, device_auth.expires_in, interval))
}

/// 后台轮询设备授权状态
async fn background_poll_device_auth(
    client_id: String,
    client_secret: String,
    device_code: String,
    region: String,
    mut interval: u64,
    expires_in: i64,
) {
    use std::time::{Duration, Instant};

    println!("[HTTP Server] Starting background polling...");

    let sso_client = AWSSSOClient::new(&region);
    let timeout = Instant::now() + Duration::from_secs(expires_in as u64);
    let start_url = "https://view.awsapps.com/start";

    loop {
        if Instant::now() > timeout {
            println!("[HTTP Server] Background polling timed out");
            *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
            *PENDING_DEVICE_AUTH.lock().unwrap() = None;
            break;
        }

        tokio::time::sleep(Duration::from_secs(interval)).await;

        match sso_client.poll_device_token(&client_id, &client_secret, &device_code).await {
            Ok(DevicePollResult::Success(token)) => {
                println!("[HTTP Server] Background poll: Authorization successful!");

                // 清除全局状态
                *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
                *PENDING_DEVICE_AUTH.lock().unwrap() = None;

                // 计算 client_id_hash
                let mut hasher = Sha256::new();
                hasher.update(start_url.as_bytes());
                let client_id_hash = hex::encode(hasher.finalize());

                // 获取用户信息
                let machine_id = get_machine_id();
                let cw_client = CodeWhispererClient::new(&machine_id);
                let usage = cw_client.get_usage_limits(&token.access_token).await.ok();
                let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);

                let email = usage.as_ref()
                    .and_then(|u| u.user_info.as_ref())
                    .and_then(|ui| ui.email.clone())
                    .unwrap_or_else(|| "user@builder.id".to_string());
                let user_id = usage.as_ref()
                    .and_then(|u| u.user_info.as_ref())
                    .and_then(|ui| ui.user_id.clone());

                let expires_at = chrono::Local::now() + chrono::Duration::seconds(token.expires_in);

                // 保存账号到文件
                let mut store = AccountStore::new();

                if let Some(existing) = store.accounts.iter_mut()
                    .find(|a| a.email == email && a.provider.as_deref() == Some("BuilderId"))
                {
                    existing.access_token = Some(token.access_token.clone());
                    existing.refresh_token = Some(token.refresh_token.clone());
                    existing.user_id = user_id;
                    existing.expires_at = Some(expires_at.format("%Y/%m/%d %H:%M:%S").to_string());
                    existing.client_id_hash = Some(client_id_hash);
                    existing.client_id = Some(client_id.clone());
                    existing.client_secret = Some(client_secret.clone());
                    existing.region = Some(region.clone());
                    existing.sso_session_id = token.aws_sso_app_session_id;
                    existing.id_token = token.id_token;
                    existing.usage_data = Some(usage_data);
                    existing.status = "正常".to_string();
                } else {
                    let mut account = Account::new(email.clone(), "Kiro BuilderId 账号".to_string());
                    account.access_token = Some(token.access_token.clone());
                    account.refresh_token = Some(token.refresh_token.clone());
                    account.provider = Some("BuilderId".to_string());
                    account.user_id = user_id;
                    account.expires_at = Some(expires_at.format("%Y/%m/%d %H:%M:%S").to_string());
                    account.client_id_hash = Some(client_id_hash);
                    account.client_id = Some(client_id.clone());
                    account.client_secret = Some(client_secret.clone());
                    account.region = Some(region.clone());
                    account.sso_session_id = token.aws_sso_app_session_id;
                    account.id_token = token.id_token;
                    account.usage_data = Some(usage_data);
                    store.accounts.insert(0, account);
                }

                store.save_to_file();
                println!("[HTTP Server] Account saved: {}", email);

                // 注册成功后自动重置机器码
                match reset_kiro_machine_id_inner() {
                    Ok(info) => {
                        let mid = info.machine_id.unwrap_or_default();
                        println!("[HTTP Server] Machine ID reset: {}...", &mid[..16.min(mid.len())]);
                    }
                    Err(e) => {
                        println!("[HTTP Server] Warning: Failed to reset machine ID: {}", e);
                    }
                }

                break;
            }
            Ok(DevicePollResult::Pending) => {
                // 继续轮询
                continue;
            }
            Ok(DevicePollResult::SlowDown) => {
                // 增加轮询间隔
                interval += 5;
                continue;
            }
            Ok(DevicePollResult::Expired) => {
                println!("[HTTP Server] Background poll: Device code expired");
                *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
                *PENDING_DEVICE_AUTH.lock().unwrap() = None;
                break;
            }
            Ok(DevicePollResult::Denied) => {
                println!("[HTTP Server] Background poll: Authorization denied");
                *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
                *PENDING_DEVICE_AUTH.lock().unwrap() = None;
                break;
            }
            Err(e) => {
                println!("[HTTP Server] Background poll error: {}", e);
                // 继续尝试
                continue;
            }
        }
    }
}

/// 内部函数：轮询设备授权状态
async fn poll_device_auth_internal() -> Result<String, String> {
    let pending = {
        PENDING_DEVICE_AUTH.lock().unwrap().clone()
    };

    let pending = pending.ok_or("No pending device authorization")?;

    // 检查是否过期
    let now = chrono::Utc::now().timestamp();
    if now > pending.expires_at {
        // 清除状态
        *PENDING_DEVICE_AUTH.lock().unwrap() = None;
        *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
        return Ok(r#"{"status":"expired"}"#.to_string());
    }

    let sso_client = AWSSSOClient::new(&pending.region);

    match sso_client.poll_device_token(&pending.client_id, &pending.client_secret, &pending.device_code).await? {
        DevicePollResult::Success(token) => {
            println!("[HTTP Server] Authorization successful!");

            // 清除全局状态
            *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
            *PENDING_DEVICE_AUTH.lock().unwrap() = None;

            // 计算 client_id_hash
            let start_url = "https://view.awsapps.com/start";
            let mut hasher = Sha256::new();
            hasher.update(start_url.as_bytes());
            let client_id_hash = hex::encode(hasher.finalize());

            // 获取用户信息
            let machine_id = get_machine_id();
            let cw_client = CodeWhispererClient::new(&machine_id);
            let usage = cw_client.get_usage_limits(&token.access_token).await.ok();
            let usage_data = serde_json::to_value(&usage).unwrap_or(serde_json::Value::Null);

            let email = usage.as_ref()
                .and_then(|u| u.user_info.as_ref())
                .and_then(|ui| ui.email.clone())
                .unwrap_or_else(|| "user@builder.id".to_string());
            let user_id = usage.as_ref()
                .and_then(|u| u.user_info.as_ref())
                .and_then(|ui| ui.user_id.clone());

            let expires_at = chrono::Local::now() + chrono::Duration::seconds(token.expires_in);

            // 保存账号到文件
            let mut store = AccountStore::new();

            let account = if let Some(existing) = store.accounts.iter_mut()
                .find(|a| a.email == email && a.provider.as_deref() == Some("BuilderId"))
            {
                existing.access_token = Some(token.access_token.clone());
                existing.refresh_token = Some(token.refresh_token.clone());
                existing.user_id = user_id;
                existing.expires_at = Some(expires_at.format("%Y/%m/%d %H:%M:%S").to_string());
                existing.client_id_hash = Some(client_id_hash);
                existing.client_id = Some(pending.client_id.clone());
                existing.client_secret = Some(pending.client_secret.clone());
                existing.region = Some(pending.region.clone());
                existing.sso_session_id = token.aws_sso_app_session_id;
                existing.id_token = token.id_token;
                existing.usage_data = Some(usage_data);
                existing.status = "正常".to_string();
                existing.clone()
            } else {
                let mut account = Account::new(email.clone(), "Kiro BuilderId 账号".to_string());
                account.access_token = Some(token.access_token.clone());
                account.refresh_token = Some(token.refresh_token.clone());
                account.provider = Some("BuilderId".to_string());
                account.user_id = user_id;
                account.expires_at = Some(expires_at.format("%Y/%m/%d %H:%M:%S").to_string());
                account.client_id_hash = Some(client_id_hash);
                account.client_id = Some(pending.client_id.clone());
                account.client_secret = Some(pending.client_secret.clone());
                account.region = Some(pending.region.clone());
                account.sso_session_id = token.aws_sso_app_session_id;
                account.id_token = token.id_token;
                account.usage_data = Some(usage_data);
                store.accounts.insert(0, account.clone());
                account
            };

            store.save_to_file();

            println!("[HTTP Server] Account saved: {}", email);

            // 注册成功后自动重置机器码，为下一次注册准备新的机器码
            let new_machine_id = match reset_kiro_machine_id_inner() {
                Ok(info) => {
                    let mid = info.machine_id.unwrap_or_default();
                    println!("[HTTP Server] Machine ID reset for next registration: {}...", &mid[..16.min(mid.len())]);
                    Some(mid)
                }
                Err(e) => {
                    println!("[HTTP Server] Warning: Failed to reset machine ID: {}", e);
                    None
                }
            };

            // 返回结果，包含新机器码信息
            let response_json = if let Some(new_mid) = new_machine_id {
                format!(r#"{{"status":"success","email":"{}","account_id":"{}","machine_id_reset":true,"new_machine_id":"{}"}}"#, email, account.id, new_mid)
            } else {
                format!(r#"{{"status":"success","email":"{}","account_id":"{}","machine_id_reset":false}}"#, email, account.id)
            };

            Ok(response_json)
        }
        DevicePollResult::Pending => {
            Ok(r#"{"status":"pending"}"#.to_string())
        }
        DevicePollResult::SlowDown => {
            Ok(r#"{"status":"slow_down"}"#.to_string())
        }
        DevicePollResult::Expired => {
            *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
            *PENDING_DEVICE_AUTH.lock().unwrap() = None;
            Ok(r#"{"status":"expired"}"#.to_string())
        }
        DevicePollResult::Denied => {
            *CURRENT_DEVICE_AUTH_URL.lock().unwrap() = None;
            *PENDING_DEVICE_AUTH.lock().unwrap() = None;
            Ok(r#"{"status":"denied"}"#.to_string())
        }
    }
}
