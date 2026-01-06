// MCP 服务器管理命令

use crate::mcp::{McpConfig, McpServer};

/// 获取 MCP 配置
#[tauri::command]
pub fn get_mcp_config() -> Result<McpConfig, String> {
    McpConfig::load()
}

/// 保存/更新服务器配置
#[tauri::command]
pub fn save_mcp_server(name: String, config: McpServer) -> Result<(), String> {
    let mut mcp_config = McpConfig::load()?;
    mcp_config.mcp_servers.insert(name, config);
    mcp_config.save()
}

/// 删除服务器
#[tauri::command]
pub fn delete_mcp_server(name: String) -> Result<(), String> {
    let mut mcp_config = McpConfig::load()?;
    mcp_config.mcp_servers.remove(&name);
    mcp_config.save()
}

/// 启用/禁用服务器
#[tauri::command]
pub fn toggle_mcp_server(name: String, disabled: bool) -> Result<(), String> {
    let mut mcp_config = McpConfig::load()?;
    if let Some(server) = mcp_config.mcp_servers.get_mut(&name) {
        match server {
            McpServer::Command(cmd) => cmd.disabled = disabled,
            McpServer::Url(url) => url.disabled = disabled,
        }
        mcp_config.save()
    } else {
        Err(format!("服务器 {} 不存在", name))
    }
}
