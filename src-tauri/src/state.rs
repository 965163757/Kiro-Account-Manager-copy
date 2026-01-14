// 应用全局状态

use std::sync::Mutex;
use crate::auth::AuthState;
use crate::account::AccountStore;

#[derive(Clone)]
pub struct PendingLogin {
    pub provider: String,
    pub code_verifier: String,
    pub state: String,
    pub machineid: String,
}

/// 待处理的设备授权信息（用于 HTTP 接口轮询）
#[derive(Clone)]
pub struct PendingDeviceAuth {
    pub device_code: String,
    pub client_id: String,
    pub client_secret: String,
    pub region: String,
    pub expires_at: i64,
}

/// 当前设备授权 URL（用于外部脚本获取）
pub static CURRENT_DEVICE_AUTH_URL: Mutex<Option<String>> = Mutex::new(None);

/// 当前待处理的设备授权信息
pub static PENDING_DEVICE_AUTH: Mutex<Option<PendingDeviceAuth>> = Mutex::new(None);

pub struct AppState {
    pub store: Mutex<AccountStore>,
    pub auth: AuthState,
    pub pending_login: Mutex<Option<PendingLogin>>,
}
