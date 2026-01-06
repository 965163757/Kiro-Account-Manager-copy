// Providers 模块 - 认证提供者
// 参考 kiro-batch-login 的结构

mod base;
mod social;
mod idc;
mod factory;
pub mod web_oauth;

pub use base::{AuthResult, AuthProvider, RefreshMetadata};
pub use social::SocialProvider;
pub use idc::IdcProvider;
pub use factory::*;
// WebOAuthProvider 通过 web_oauth 模块访问
