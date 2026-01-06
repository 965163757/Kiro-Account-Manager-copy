// 系统机器码管理命令 (Windows MachineGuid / macOS IOPlatformUUID / Linux machine-id)
// 支持三端：Windows、macOS、Linux

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use chrono::Local;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemMachineInfo {
    pub machine_guid: Option<String>,
    pub backup_exists: bool,
    pub backup_time: Option<String>,
    pub os_type: String,           // windows / macos / linux
    pub can_modify: bool,          // 是否可以修改
    pub requires_admin: bool,      // 是否需要管理员权限
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MachineGuidBackup {
    pub machine_guid: String,
    pub backup_time: String,
    pub computer_name: Option<String>,
    pub os_type: Option<String>,
}

fn get_machine_guid_backup_path() -> PathBuf {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    data_dir
        .join(".kiro-account-manager")
        .join("machine-guid-backup.json")
}

// macOS 覆盖文件路径（硬件 UUID 无法修改，用覆盖文件变通）
#[allow(dead_code)]
fn get_macos_override_path() -> PathBuf {
    let data_dir = dirs::data_dir()
        .unwrap_or_else(|| PathBuf::from("."));
    data_dir
        .join(".kiro-account-manager")
        .join("machine-id-override")
}

/// 获取操作系统类型
#[allow(dead_code)]
pub fn get_os_type() -> &'static str {
    #[cfg(target_os = "windows")]
    { "windows" }
    #[cfg(target_os = "macos")]
    { "macos" }
    #[cfg(target_os = "linux")]
    { "linux" }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { "unknown" }
}

/// 生成随机机器码 (UUID 格式)
pub fn generate_random_machine_id() -> String {
    Uuid::new_v4().to_string().to_lowercase()
}

/// 验证机器码格式
fn is_valid_machine_id(machine_id: &str) -> bool {
    // UUID 格式: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    let uuid_regex = regex::Regex::new(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$").unwrap();
    // 纯32位十六进制 (Linux machine-id 格式)
    let hex_regex = regex::Regex::new(r"^[0-9a-f]{32}$").unwrap();
    uuid_regex.is_match(&machine_id.to_lowercase()) || hex_regex.is_match(&machine_id.to_lowercase())
}

/// 将32位十六进制转换为 UUID 格式
#[allow(dead_code)]
fn format_as_uuid(hex: &str) -> String {
    let clean = hex.replace("-", "").to_lowercase();
    if clean.len() != 32 {
        return clean;
    }
    format!("{}-{}-{}-{}-{}", 
        &clean[0..8], &clean[8..12], &clean[12..16], &clean[16..20], &clean[20..32])
}

// ============================================================
// 获取系统机器码
// ============================================================

#[cfg(target_os = "windows")]
fn get_system_machine_guid_inner() -> Result<SystemMachineInfo, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let crypto_key = hklm.open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .map_err(|e| format!("无法打开注册表: {}", e))?;
    
    let machine_guid: String = crypto_key.get_value("MachineGuid")
        .map_err(|e| format!("无法读取 MachineGuid: {}", e))?;
    
    let backup_path = get_machine_guid_backup_path();
    let (backup_exists, backup_time) = if backup_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&backup_path) {
            if let Ok(backup) = serde_json::from_str::<MachineGuidBackup>(&content) {
                (true, Some(backup.backup_time))
            } else {
                (false, None)
            }
        } else {
            (false, None)
        }
    } else {
        (false, None)
    };
    
    Ok(SystemMachineInfo {
        machine_guid: Some(machine_guid),
        backup_exists,
        backup_time,
        os_type: "windows".to_string(),
        can_modify: true,
        requires_admin: true,
    })
}

#[cfg(target_os = "macos")]
fn get_system_machine_guid_inner() -> Result<SystemMachineInfo, String> {
    use std::process::Command;
    
    // 先检查是否有覆盖文件
    let override_path = get_macos_override_path();
    if override_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&override_path) {
            let machine_guid = content.trim().to_string();
            let backup_path = get_machine_guid_backup_path();
            let (backup_exists, backup_time) = if backup_path.exists() {
                if let Ok(content) = std::fs::read_to_string(&backup_path) {
                    if let Ok(backup) = serde_json::from_str::<MachineGuidBackup>(&content) {
                        (true, Some(backup.backup_time))
                    } else { (false, None) }
                } else { (false, None) }
            } else { (false, None) };
            
            return Ok(SystemMachineInfo {
                machine_guid: Some(machine_guid),
                backup_exists,
                backup_time,
                os_type: "macos".to_string(),
                can_modify: true,  // 通过覆盖文件可以修改
                requires_admin: false,
            });
        }
    }
    
    // 读取硬件 UUID
    let output = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .map_err(|e| format!("执行 ioreg 失败: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    
    let machine_guid = stdout
        .lines()
        .find(|line| line.contains("IOPlatformUUID"))
        .and_then(|line| {
            line.split('"')
                .nth(3)
                .map(|s| s.to_string())
        })
        .ok_or("无法获取 IOPlatformUUID")?;
    
    let backup_path = get_machine_guid_backup_path();
    let (backup_exists, backup_time) = if backup_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&backup_path) {
            if let Ok(backup) = serde_json::from_str::<MachineGuidBackup>(&content) {
                (true, Some(backup.backup_time))
            } else { (false, None) }
        } else { (false, None) }
    } else { (false, None) };
    
    Ok(SystemMachineInfo {
        machine_guid: Some(machine_guid),
        backup_exists,
        backup_time,
        os_type: "macos".to_string(),
        can_modify: true,  // 通过覆盖文件可以修改
        requires_admin: false,
    })
}

#[cfg(target_os = "linux")]
fn get_system_machine_guid_inner() -> Result<SystemMachineInfo, String> {
    let paths = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
    
    for path in &paths {
        if std::path::Path::new(path).exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                let raw_id = content.trim().to_string();
                let machine_guid = format_as_uuid(&raw_id);
                
                let backup_path = get_machine_guid_backup_path();
                let (backup_exists, backup_time) = if backup_path.exists() {
                    if let Ok(content) = std::fs::read_to_string(&backup_path) {
                        if let Ok(backup) = serde_json::from_str::<MachineGuidBackup>(&content) {
                            (true, Some(backup.backup_time))
                        } else { (false, None) }
                    } else { (false, None) }
                } else { (false, None) };
                
                return Ok(SystemMachineInfo {
                    machine_guid: Some(machine_guid),
                    backup_exists,
                    backup_time,
                    os_type: "linux".to_string(),
                    can_modify: true,
                    requires_admin: true,
                });
            }
        }
    }
    
    Err("无法获取 Linux 机器码".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn get_system_machine_guid_inner() -> Result<SystemMachineInfo, String> {
    Err("此功能仅支持 Windows、macOS 和 Linux 系统".to_string())
}

// ============================================================
// 备份机器码
// ============================================================

#[cfg(target_os = "windows")]
fn backup_machine_guid_inner() -> Result<MachineGuidBackup, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let crypto_key = hklm.open_subkey("SOFTWARE\\Microsoft\\Cryptography")
        .map_err(|e| format!("无法打开注册表: {}", e))?;
    
    let machine_guid: String = crypto_key.get_value("MachineGuid")
        .map_err(|e| format!("无法读取 MachineGuid: {}", e))?;
    
    let computer_name = std::env::var("COMPUTERNAME").ok();
    let backup_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    let backup = MachineGuidBackup {
        machine_guid: machine_guid.clone(),
        backup_time: backup_time.clone(),
        computer_name,
        os_type: Some("windows".to_string()),
    };
    
    let backup_path = get_machine_guid_backup_path();
    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    let content = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&backup_path, content)
        .map_err(|e| format!("写入备份失败: {}", e))?;
    
    Ok(backup)
}

#[cfg(target_os = "macos")]
fn backup_machine_guid_inner() -> Result<MachineGuidBackup, String> {
    use std::process::Command;
    
    // 读取硬件 UUID
    let output = Command::new("ioreg")
        .args(["-rd1", "-c", "IOPlatformExpertDevice"])
        .output()
        .map_err(|e| format!("执行 ioreg 失败: {}", e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let machine_guid = stdout
        .lines()
        .find(|line| line.contains("IOPlatformUUID"))
        .and_then(|line| line.split('"').nth(3).map(|s| s.to_string()))
        .ok_or("无法获取 IOPlatformUUID")?;
    
    let computer_name = std::env::var("HOSTNAME").ok()
        .or_else(|| std::env::var("USER").ok());
    let backup_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    
    let backup = MachineGuidBackup {
        machine_guid: machine_guid.clone(),
        backup_time: backup_time.clone(),
        computer_name,
        os_type: Some("macos".to_string()),
    };
    
    let backup_path = get_machine_guid_backup_path();
    if let Some(parent) = backup_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    let content = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("序列化失败: {}", e))?;
    std::fs::write(&backup_path, content)
        .map_err(|e| format!("写入备份失败: {}", e))?;
    
    Ok(backup)
}

#[cfg(target_os = "linux")]
fn backup_machine_guid_inner() -> Result<MachineGuidBackup, String> {
    let paths = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
    
    for path in &paths {
        if std::path::Path::new(path).exists() {
            if let Ok(content) = std::fs::read_to_string(path) {
                let raw_id = content.trim().to_string();
                let machine_guid = format_as_uuid(&raw_id);
                
                let computer_name = std::env::var("HOSTNAME").ok()
                    .or_else(|| std::env::var("USER").ok());
                let backup_time = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                
                let backup = MachineGuidBackup {
                    machine_guid,
                    backup_time: backup_time.clone(),
                    computer_name,
                    os_type: Some("linux".to_string()),
                };
                
                let backup_path = get_machine_guid_backup_path();
                if let Some(parent) = backup_path.parent() {
                    std::fs::create_dir_all(parent).ok();
                }
                
                let content = serde_json::to_string_pretty(&backup)
                    .map_err(|e| format!("序列化失败: {}", e))?;
                std::fs::write(&backup_path, content)
                    .map_err(|e| format!("写入备份失败: {}", e))?;
                
                return Ok(backup);
            }
        }
    }
    
    Err("无法读取 Linux 机器码".to_string())
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn backup_machine_guid_inner() -> Result<MachineGuidBackup, String> {
    Err("此功能仅支持 Windows、macOS 和 Linux 系统".to_string())
}

// ============================================================
// 恢复机器码
// ============================================================

#[cfg(target_os = "windows")]
fn restore_machine_guid_inner() -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let backup_path = get_machine_guid_backup_path();
    if !backup_path.exists() {
        return Err("没有找到备份文件".to_string());
    }
    
    let content = std::fs::read_to_string(&backup_path)
        .map_err(|e| format!("读取备份失败: {}", e))?;
    let backup: MachineGuidBackup = serde_json::from_str(&content)
        .map_err(|e| format!("解析备份失败: {}", e))?;
    
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let crypto_key = hklm.open_subkey_with_flags("SOFTWARE\\Microsoft\\Cryptography", KEY_SET_VALUE)
        .map_err(|e| format!("无法打开注册表（需要管理员权限）: {}", e))?;
    
    crypto_key.set_value("MachineGuid", &backup.machine_guid)
        .map_err(|e| format!("写入注册表失败（需要管理员权限）: {}", e))?;
    
    Ok(backup.machine_guid)
}

#[cfg(target_os = "macos")]
fn restore_machine_guid_inner() -> Result<String, String> {
    let backup_path = get_machine_guid_backup_path();
    if !backup_path.exists() {
        return Err("没有找到备份文件".to_string());
    }
    
    let content = std::fs::read_to_string(&backup_path)
        .map_err(|e| format!("读取备份失败: {}", e))?;
    let backup: MachineGuidBackup = serde_json::from_str(&content)
        .map_err(|e| format!("解析备份失败: {}", e))?;
    
    // macOS 使用覆盖文件方式
    let override_path = get_macos_override_path();
    if let Some(parent) = override_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    std::fs::write(&override_path, &backup.machine_guid)
        .map_err(|e| format!("写入覆盖文件失败: {}", e))?;
    
    Ok(backup.machine_guid)
}

#[cfg(target_os = "linux")]
fn restore_machine_guid_inner() -> Result<String, String> {
    let backup_path = get_machine_guid_backup_path();
    if !backup_path.exists() {
        return Err("没有找到备份文件".to_string());
    }
    
    let content = std::fs::read_to_string(&backup_path)
        .map_err(|e| format!("读取备份失败: {}", e))?;
    let backup: MachineGuidBackup = serde_json::from_str(&content)
        .map_err(|e| format!("解析备份失败: {}", e))?;
    
    // 转换为32位十六进制格式（移除连字符）
    let raw_id = backup.machine_guid.replace("-", "").to_lowercase();
    
    // 尝试写入 /etc/machine-id
    std::fs::write("/etc/machine-id", format!("{}\n", raw_id))
        .map_err(|e| format!("写入 /etc/machine-id 失败（需要管理员权限）: {}", e))?;
    
    Ok(backup.machine_guid)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn restore_machine_guid_inner() -> Result<String, String> {
    Err("此功能仅支持 Windows、macOS 和 Linux 系统".to_string())
}

// ============================================================
// 重置机器码（生成新的随机机器码）
// ============================================================

#[cfg(target_os = "windows")]
fn reset_machine_guid_inner() -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    let new_guid = Uuid::new_v4().to_string().to_uppercase();
    
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let crypto_key = hklm.open_subkey_with_flags("SOFTWARE\\Microsoft\\Cryptography", KEY_SET_VALUE)
        .map_err(|e| format!("无法打开注册表（需要管理员权限）: {}", e))?;
    
    crypto_key.set_value("MachineGuid", &new_guid)
        .map_err(|e| format!("写入注册表失败（需要管理员权限）: {}", e))?;
    
    Ok(new_guid)
}

#[cfg(target_os = "macos")]
fn reset_machine_guid_inner() -> Result<String, String> {
    // macOS 使用覆盖文件方式
    let new_guid = Uuid::new_v4().to_string().to_lowercase();
    
    let override_path = get_macos_override_path();
    if let Some(parent) = override_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    std::fs::write(&override_path, &new_guid)
        .map_err(|e| format!("写入覆盖文件失败: {}", e))?;
    
    Ok(new_guid)
}

#[cfg(target_os = "linux")]
fn reset_machine_guid_inner() -> Result<String, String> {
    let new_guid = Uuid::new_v4().to_string().to_lowercase();
    // 转换为32位十六进制格式（移除连字符）
    let raw_id = new_guid.replace("-", "");
    
    // 尝试写入 /etc/machine-id
    std::fs::write("/etc/machine-id", format!("{}\n", raw_id))
        .map_err(|e| format!("写入 /etc/machine-id 失败（需要管理员权限）: {}", e))?;
    
    Ok(new_guid)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn reset_machine_guid_inner() -> Result<String, String> {
    Err("此功能仅支持 Windows、macOS 和 Linux 系统".to_string())
}

// ============================================================
// 获取备份信息
// ============================================================

fn get_machine_guid_backup_inner() -> Result<Option<MachineGuidBackup>, String> {
    let backup_path = get_machine_guid_backup_path();
    if !backup_path.exists() {
        return Ok(None);
    }
    
    let content = std::fs::read_to_string(&backup_path)
        .map_err(|e| format!("读取备份失败: {}", e))?;
    let backup: MachineGuidBackup = serde_json::from_str(&content)
        .map_err(|e| format!("解析备份失败: {}", e))?;
    
    Ok(Some(backup))
}

// ============================================================
// 设置自定义机器码
// ============================================================

#[cfg(target_os = "windows")]
fn set_custom_machine_guid_inner(new_guid: String) -> Result<String, String> {
    use winreg::enums::*;
    use winreg::RegKey;
    
    if !is_valid_machine_id(&new_guid) {
        return Err("无效的机器码格式".to_string());
    }
    
    let formatted_guid = new_guid.to_uppercase();
    
    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let crypto_key = hklm.open_subkey_with_flags("SOFTWARE\\Microsoft\\Cryptography", KEY_SET_VALUE)
        .map_err(|e| format!("无法打开注册表（需要管理员权限）: {}", e))?;
    
    crypto_key.set_value("MachineGuid", &formatted_guid)
        .map_err(|e| format!("写入注册表失败（需要管理员权限）: {}", e))?;
    
    Ok(formatted_guid)
}

#[cfg(target_os = "macos")]
fn set_custom_machine_guid_inner(new_guid: String) -> Result<String, String> {
    if !is_valid_machine_id(&new_guid) {
        return Err("无效的机器码格式".to_string());
    }
    
    let formatted_guid = new_guid.to_lowercase();
    
    // macOS 使用覆盖文件方式
    let override_path = get_macos_override_path();
    if let Some(parent) = override_path.parent() {
        std::fs::create_dir_all(parent).ok();
    }
    
    std::fs::write(&override_path, &formatted_guid)
        .map_err(|e| format!("写入覆盖文件失败: {}", e))?;
    
    Ok(formatted_guid)
}

#[cfg(target_os = "linux")]
fn set_custom_machine_guid_inner(new_guid: String) -> Result<String, String> {
    if !is_valid_machine_id(&new_guid) {
        return Err("无效的机器码格式".to_string());
    }
    
    // 转换为32位十六进制格式（移除连字符）
    let raw_id = new_guid.replace("-", "").to_lowercase();
    
    // 尝试写入 /etc/machine-id
    std::fs::write("/etc/machine-id", format!("{}\n", raw_id))
        .map_err(|e| format!("写入 /etc/machine-id 失败（需要管理员权限）: {}", e))?;
    
    Ok(format_as_uuid(&raw_id))
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn set_custom_machine_guid_inner(_new_guid: String) -> Result<String, String> {
    Err("此功能仅支持 Windows、macOS 和 Linux 系统".to_string())
}

// ============================================================
// 删除 macOS 覆盖文件（恢复使用硬件 UUID）
// ============================================================

#[cfg(target_os = "macos")]
fn clear_macos_override_inner() -> Result<(), String> {
    let override_path = get_macos_override_path();
    if override_path.exists() {
        std::fs::remove_file(&override_path)
            .map_err(|e| format!("删除覆盖文件失败: {}", e))?;
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn clear_macos_override_inner() -> Result<(), String> {
    Ok(()) // 非 macOS 系统不需要此操作
}

// ============================================================
// Tauri Commands
// ============================================================

#[tauri::command]
pub async fn get_system_machine_guid() -> Result<SystemMachineInfo, String> {
    tokio::task::spawn_blocking(get_system_machine_guid_inner)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn backup_machine_guid() -> Result<MachineGuidBackup, String> {
    tokio::task::spawn_blocking(backup_machine_guid_inner)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn restore_machine_guid() -> Result<String, String> {
    tokio::task::spawn_blocking(restore_machine_guid_inner)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn reset_system_machine_guid() -> Result<String, String> {
    tokio::task::spawn_blocking(reset_machine_guid_inner)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_machine_guid_backup() -> Result<Option<MachineGuidBackup>, String> {
    tokio::task::spawn_blocking(get_machine_guid_backup_inner)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_custom_machine_guid(new_guid: String) -> Result<String, String> {
    tokio::task::spawn_blocking(move || set_custom_machine_guid_inner(new_guid))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn clear_macos_override() -> Result<(), String> {
    tokio::task::spawn_blocking(clear_macos_override_inner)
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn generate_machine_guid() -> String {
    generate_random_machine_id()
}
