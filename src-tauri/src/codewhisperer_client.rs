// CodeWhisperer API Client
// 用于 IdC (BuilderId) 账号获取限额信息

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;
use uuid::Uuid;

const CODEWHISPERER_API: &str = "https://codewhisperer.us-east-1.amazonaws.com";

/// CodeWhisperer 限额响应
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeWhispererUsageResponse {
    pub days_until_reset: Option<i32>,
    pub next_date_reset: Option<f64>,
    pub user_info: Option<UserInfo>,
    pub subscription_info: Option<SubscriptionInfo>,
    pub usage_breakdown_list: Option<Vec<UsageBreakdown>>,
    pub overage_configuration: Option<OverageConfiguration>,
    pub limits: Option<Vec<serde_json::Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub email: Option<String>,
    pub user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionInfo {
    pub subscription_title: Option<String>,
    #[serde(rename = "type")]
    pub subscription_type: Option<String>,
    pub overage_capability: Option<String>,
    pub upgrade_capability: Option<String>,
    pub subscription_management_target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverageConfiguration {
    pub overage_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageBreakdown {
    pub usage_limit: Option<i32>,
    pub current_usage: Option<i32>,
    pub usage_limit_with_precision: Option<f64>,
    pub current_usage_with_precision: Option<f64>,
    pub next_date_reset: Option<f64>,
    pub free_trial_info: Option<FreeTrialInfo>,
    pub bonuses: Option<Vec<BonusInfo>>,
    pub overage_rate: Option<f64>,
    pub overage_cap: Option<i32>,
    pub overage_cap_with_precision: Option<f64>,
    pub current_overages: Option<i32>,
    pub current_overages_with_precision: Option<f64>,
    pub overage_charges: Option<f64>,
    pub display_name: Option<String>,
    pub display_name_plural: Option<String>,
    pub resource_type: Option<String>,
    pub unit: Option<String>,
    pub currency: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FreeTrialInfo {
    pub usage_limit: Option<i32>,
    pub current_usage: Option<i32>,
    pub usage_limit_with_precision: Option<f64>,
    pub current_usage_with_precision: Option<f64>,
    pub free_trial_expiry: Option<f64>,
    pub free_trial_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BonusInfo {
    pub bonus_code: Option<String>,
    pub display_name: Option<String>,
    pub usage_limit: Option<f64>,
    pub current_usage: Option<f64>,
    pub expires_at: Option<f64>,
    pub status: Option<String>,
}

pub struct CodeWhispererClient {
    client: Client,
    machine_id: String,
}

impl CodeWhispererClient {
    pub fn new(machine_id: &str) -> Self {
        let client = Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            machine_id: machine_id.to_string(),
        }
    }

    /// 生成 invocation ID
    fn generate_invocation_id() -> String {
        Uuid::new_v4().to_string()
    }

    /// 获取限额信息 (用于 IdC/BuilderId token)
    pub async fn get_usage_limits(&self, access_token: &str) -> Result<CodeWhispererUsageResponse, String> {
        let url = format!(
            "{}/getUsageLimits?isEmailRequired=true&origin=AI_EDITOR&resourceType=AGENTIC_REQUEST",
            CODEWHISPERER_API
        );

        let kiro_version = "0.6.18";
        let x_amz_user_agent = format!("aws-sdk-js/1.0.0 KiroIDE-{}-{}", kiro_version, self.machine_id);
        let user_agent = format!(
            "aws-sdk-js/1.0.0 ua/2.1 os/windows lang/js md/nodejs#20.16.0 api/codewhispererruntime#1.0.0 m/E KiroIDE-{}-{}",
            kiro_version, self.machine_id
        );

        println!("\n[CodeWhisperer] GET USAGE LIMITS");
        println!("URL: {}", url);

        let response = self.client
            .get(&url)
            .header("Authorization", format!("Bearer {}", access_token))
            .header("x-amz-user-agent", &x_amz_user_agent)
            .header("user-agent", &user_agent)
            .header("amz-sdk-invocation-id", Self::generate_invocation_id())
            .header("amz-sdk-request", "attempt=1; max=1")
            .header("Connection", "close")
            .send()
            .await
            .map_err(|e| format!("Request failed: {}", e))?;

        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        println!("Status: {}", status);

        if !status.is_success() {
            println!("Error: {}", text);
            // 解析错误响应，提取 reason 字段
            if let Ok(error_json) = serde_json::from_str::<serde_json::Value>(&text) {
                if let Some(reason) = error_json.get("reason").and_then(|r| r.as_str()) {
                    // 返回特殊格式: "BANNED:REASON" 便于上层识别
                    return Err(format!("BANNED:{}", reason));
                }
            }
            return Err(format!("GetUsageLimits failed ({}): {}", status, text));
        }

        // 打印响应
        if let Ok(json) = serde_json::from_str::<serde_json::Value>(&text) {
            if let Ok(pretty) = serde_json::to_string_pretty(&json) {
                println!("{}", pretty);
            }
        }

        serde_json::from_str(&text)
            .map_err(|e| format!("Parse failed: {}", e))
    }
}
