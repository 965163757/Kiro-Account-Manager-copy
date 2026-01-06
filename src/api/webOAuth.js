// Web OAuth API - Cognito + CBOR 登录
// 两步流程：initiate -> complete

import { invoke } from '@tauri-apps/api/core'

/**
 * 第一步：发起 Web OAuth 登录
 * 会打开浏览器进行授权
 * @param {string} provider - "Google" 或 "Github"
 * @returns {Promise<string>} state 参数
 */
export async function webOAuthInitiate(provider) {
  return await invoke('web_oauth_initiate', { provider })
}

/**
 * 第二步：完成 Web OAuth 登录
 * @param {string} callbackUrl - 浏览器回调的完整 URL
 * @returns {Promise<string>} 登录结果消息
 */
export async function webOAuthComplete(callbackUrl) {
  return await invoke('web_oauth_complete', { callbackUrl })
}

/**
 * 刷新 Web OAuth Token
 * @param {string} tokenId - Token ID
 * @returns {Promise<object>} 更新后的 Token 对象
 */
export async function webOAuthRefresh(tokenId) {
  return await invoke('web_oauth_refresh', { accountId: tokenId })
}

/**
 * 一键登录：打开 WebView 窗口进行授权
 * @param {string} provider - "Google" 或 "Github"
 * @returns {Promise<{window_label: string, state: string}>}
 */
export async function webOAuthLogin(provider) {
  return await invoke('web_oauth_login', { provider })
}

/**
 * 关闭 OAuth 窗口
 * @param {string} windowLabel - 窗口标签
 */
export async function webOAuthCloseWindow(windowLabel) {
  return await invoke('web_oauth_close_window', { windowLabel })
}
