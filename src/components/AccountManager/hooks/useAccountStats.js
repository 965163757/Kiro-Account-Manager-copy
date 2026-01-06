import { useMemo } from 'react'
import { calcAccountStats, getUsagePercent as getUsagePercentUtil } from '../../../utils/accountStats'

// Hook: 使用 memoized 统计数据
export function useAccountStats(accounts) {
  return useMemo(() => calcAccountStats(accounts), [accounts])
}

// 重新导出工具函数供组件使用
export const getUsagePercent = getUsagePercentUtil

export function getUsageColor(percent, isDark) {
  if (percent > 80) return isDark ? 'text-red-500' : 'text-red-600'
  if (percent > 50) return isDark ? 'text-yellow-500' : 'text-yellow-600'
  return isDark ? 'text-green-500' : 'text-green-600'
}

export function getProgressBarColor(percent) {
  if (percent > 80) return 'bg-gradient-to-r from-red-400 to-red-500'
  if (percent > 50) return 'bg-gradient-to-r from-yellow-400 to-orange-500'
  return 'bg-gradient-to-r from-green-400 to-emerald-500'
}
