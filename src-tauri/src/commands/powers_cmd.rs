// Powers 管理命令

use crate::powers::{PowersRegistry, PowerInfo};

/// 获取已安装的 Powers
#[tauri::command]
pub fn get_installed_powers() -> Result<Vec<PowerInfo>, String> {
    let registry = PowersRegistry::load()?;
    Ok(registry.get_installed())
}

/// 获取所有 Powers（包括未安装的）
#[tauri::command]
pub fn get_all_powers() -> Result<Vec<PowerInfo>, String> {
    let registry = PowersRegistry::load()?;
    Ok(registry.get_all())
}

/// 获取 Powers 注册表（兼容旧接口）
#[tauri::command]
pub fn get_powers_registry() -> Result<PowersRegistry, String> {
    PowersRegistry::load()
}

/// 安装 Power
#[tauri::command]
pub async fn install_power(name: String) -> Result<PowerInfo, String> {
    tokio::task::spawn_blocking(move || {
        let mut registry = PowersRegistry::load()?;
        registry.install_power(&name)
    })
    .await
    .map_err(|e| format!("任务失败: {}", e))?
}

/// 卸载 Power
#[tauri::command]
pub async fn uninstall_power(name: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let mut registry = PowersRegistry::load()?;
        registry.uninstall_power(&name)
    })
    .await
    .map_err(|e| format!("任务失败: {}", e))?
}
