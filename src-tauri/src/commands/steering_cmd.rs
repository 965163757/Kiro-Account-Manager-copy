// Steering 管理命令

use crate::steering::{SteeringFile, SteeringManager};
use tauri::command;

#[command]
pub fn get_steering_files() -> Result<Vec<SteeringFile>, String> {
    SteeringManager::load_all()
}

#[command]
pub fn get_steering_file(file_name: String) -> Result<SteeringFile, String> {
    SteeringManager::load(&file_name)
}

#[command]
pub fn save_steering_file(file_name: String, content: String) -> Result<(), String> {
    SteeringManager::save(&file_name, &content)
}

#[command]
pub fn delete_steering_file(file_name: String) -> Result<(), String> {
    SteeringManager::delete(&file_name)
}

#[command]
pub fn create_steering_file(file_name: String, content: String) -> Result<SteeringFile, String> {
    SteeringManager::create(&file_name, &content)
}
