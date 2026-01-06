// 账号统计计算工具函数

// 从 account 获取 quota（兼容旧数据和新 usageData）
// API 返回 camelCase，后端 serde 序列化也是 camelCase
// 兼容 usageBreakdownList（数组）和 usageBreakdown（单个对象）
const getBreakdown = (a) => {
  return a.usageData?.usageBreakdownList?.[0] || a.usageData?.usageBreakdown || null
}
const getQuota = (a) => {
  const breakdown = getBreakdown(a)
  const main = breakdown?.usageLimit ?? breakdown?.usage_limit ?? a.quota ?? 50
  // 兼容 camelCase 和 snake_case
  const freeTrialInfo = breakdown?.freeTrialInfo || breakdown?.free_trial_info
  const freeTrial = freeTrialInfo?.usageLimit ?? freeTrialInfo?.usage_limit ?? 0
  const bonuses = breakdown?.bonuses || []
  const bonus = bonuses.reduce((sum, b) => sum + (b.usageLimit || b.usage_limit || 0), 0)
  return main + freeTrial + bonus
}
const getUsed = (a) => {
  const breakdown = getBreakdown(a)
  const main = breakdown?.currentUsage ?? breakdown?.current_usage ?? a.used ?? 0
  // 兼容 camelCase 和 snake_case
  const freeTrialInfo = breakdown?.freeTrialInfo || breakdown?.free_trial_info
  const freeTrial = freeTrialInfo?.currentUsage ?? freeTrialInfo?.current_usage ?? 0
  const bonuses = breakdown?.bonuses || []
  const bonus = bonuses.reduce((sum, b) => sum + (b.currentUsage || b.current_usage || 0), 0)
  return main + freeTrial + bonus
}
const getSubType = (a) => a.usageData?.subscriptionInfo?.type ?? a.subscriptionType ?? ''
const getSubPlan = (a) => a.usageData?.subscriptionInfo?.subscriptionTitle ?? a.subscriptionPlan ?? ''

export function calcAccountStats(accounts) {
  const total = accounts.length
  const active = accounts.filter(a => a.status === '正常' || a.status === '有效').length
  // 使用 Math.round 避免浮点数精度问题
  const totalQuota = Math.round(accounts.reduce((sum, a) => sum + getQuota(a), 0))
  const totalUsed = Math.round(accounts.reduce((sum, a) => sum + getUsed(a), 0))
  const proPlus = accounts.filter(a => getSubType(a).includes('PRO+') || getSubPlan(a).includes('PRO+')).length
  const pro = accounts.filter(a => 
    (getSubType(a).includes('PRO') || getSubPlan(a).includes('PRO')) && 
    !(getSubType(a).includes('PRO+') || getSubPlan(a).includes('PRO+'))
  ).length
  const usagePercent = totalQuota > 0 ? (totalUsed / totalQuota * 100).toFixed(1) : 0

  return { total, active, totalQuota, totalUsed, proPlus, pro, usagePercent, remaining: totalQuota - totalUsed }
}

export function getUsagePercent(used, quota) {
  return quota === 0 ? 0 : Math.min(100, (used / quota) * 100)
}

export { getQuota, getUsed, getSubType, getSubPlan }
