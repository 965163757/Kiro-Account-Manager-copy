import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { RefreshCw, Users, Zap, Shield, Clock, TrendingUp, Sparkles } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useDialog } from '../contexts/DialogContext'
import { useI18n } from '../i18n.jsx'
import { calcAccountStats, getQuota, getUsed } from '../utils/accountStats'

// 骨架屏组件
function Skeleton({ className }) {
  return <div className={`skeleton ${className}`} />
}

// 骨架屏加载状态
function LoadingSkeleton({ isDark, colors }) {
  return (
    <div className={`h-full overflow-auto ${colors.main}`}>
      {/* 背景装饰 */}
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />
      
      <div className="max-w-5xl mx-auto p-8 relative">
        {/* Header 骨架 */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Skeleton className="w-12 h-12 rounded-2xl" />
            <Skeleton className="w-64 h-8 rounded-lg" />
          </div>
          <Skeleton className="w-80 h-5 rounded-lg mt-3" />
        </div>

        {/* 统计卡片骨架 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className={`${colors.card} rounded-2xl p-5 border ${colors.cardBorder}`}>
              <div className="flex items-center justify-between mb-3">
                <Skeleton className="w-12 h-12 rounded-xl" />
                <Skeleton className="w-12 h-10 rounded-lg" />
              </div>
              <Skeleton className="w-20 h-4 rounded" />
            </div>
          ))}
        </div>

        {/* 主内容骨架 */}
        <div className="grid grid-cols-2 gap-6">
          <div className={`${colors.card} rounded-2xl border ${colors.cardBorder} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${colors.cardBorder}`}>
              <Skeleton className="w-32 h-5 rounded" />
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-4">
                <Skeleton className="w-16 h-16 rounded-2xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="w-24 h-5 rounded" />
                  <Skeleton className="w-16 h-4 rounded" />
                </div>
              </div>
              <Skeleton className="w-full h-24 rounded-xl" />
            </div>
          </div>
          
          <div className={`${colors.card} rounded-2xl border ${colors.cardBorder} overflow-hidden`}>
            <div className={`px-6 py-4 border-b ${colors.cardBorder}`}>
              <Skeleton className="w-24 h-5 rounded" />
            </div>
            <div className="p-6 space-y-4">
              <Skeleton className="w-full h-16 rounded-xl" />
              <div className="grid grid-cols-3 gap-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-xl" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// 统计卡片组件 - 紧凑版
function StatCard({ icon: Icon, iconBg, value, label, delay, isDark }) {
  return (
    <div 
      className={`card-glow rounded-xl p-3 shadow-sm border animate-scale-in ${delay}`}
      style={{ 
        background: isDark ? 'rgba(30, 30, 50, 0.8)' : 'white',
        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'
      }}
    >
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center`}>
          <Icon size={18} className={isDark ? 'text-current' : ''} />
        </div>
        <div>
          <span className={`text-xl font-bold stat-number ${isDark ? 'text-white' : 'text-gray-900'}`}>{value}</span>
          <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{label}</div>
        </div>
      </div>
    </div>
  )
}

function Home() {
  const { theme, colors } = useTheme()
  const { showError } = useDialog()
  const { t } = useI18n()
  const [tokens, setTokens] = useState([])
  const [localToken, setLocalToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [tokensData, localData] = await Promise.all([
        invoke('get_accounts'),
        invoke('get_kiro_local_token').catch(() => null)
      ])
      setTokens(tokensData)
      setLocalToken(localData)
    } catch (e) { 
      console.error('Failed to load data:', e)
      showError('加载失败', '加载数据失败: ' + e)
    }
    setLoading(false)
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadData()
    setTimeout(() => setRefreshing(false), 500)
  }

  const stats = calcAccountStats(tokens)
  
  // 找到与当前登录账号匹配的账号（按优先级：refreshToken > accessToken > provider）
  const currentAccount = localToken 
    ? tokens.find(t => 
        (localToken.refreshToken && t.refreshToken === localToken.refreshToken) ||
        (localToken.accessToken && t.accessToken === localToken.accessToken) ||
        (localToken.provider && t.provider === localToken.provider)
      )
    : null
  const currentQuota = currentAccount ? getQuota(currentAccount) : 0
  const currentUsed = currentAccount ? getUsed(currentAccount) : 0
  const currentPercent = currentQuota > 0 ? Math.round((currentUsed / currentQuota) * 100) : 0
  const isDark = theme === 'dark'

  if (loading) {
    return <LoadingSkeleton isDark={isDark} colors={colors} />
  }

  const statCards = [
    { icon: Users, iconBg: isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-600', value: stats.total, label: t('home.totalAccounts'), delay: 'delay-100' },
    { icon: Shield, iconBg: isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600', value: stats.active, label: t('home.activeAccounts'), delay: 'delay-200' },
    { icon: Zap, iconBg: isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-600', value: stats.proPlus + stats.pro, label: t('home.proAccounts'), delay: 'delay-300' },
    { icon: TrendingUp, iconBg: isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-600', value: `${stats.usagePercent}%`, label: t('home.usagePercent'), delay: 'delay-400' },
  ]

  return (
    <div className={`h-full overflow-auto ${colors.main}`}>
      {/* 背景装饰光晕 */}
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />
      
      <div className="max-w-5xl mx-auto p-8 relative">
        {/* Header */}
        <div className="mb-8 animate-bounce-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/25 animate-float">
              <Sparkles size={24} className="text-white" />
            </div>
            <h1 className={`text-2xl font-bold ${colors.text}`}>{t('home.title')}</h1>
          </div>
          <p className={colors.textMuted}>{t('home.subtitle')}</p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          {statCards.map((card, index) => (
            <StatCard key={index} {...card} isDark={isDark} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* 本地 Kiro 账号 */}
          <div className={`card-glow ${colors.card} rounded-2xl shadow-sm border ${colors.cardBorder} overflow-hidden animate-scale-in delay-300`}>
            <div className={`px-6 py-4 border-b ${colors.cardBorder} flex items-center justify-between`}>
              <h2 className={`font-semibold ${colors.text}`}>{t('home.currentAccount')}</h2>
              <button 
                onClick={handleRefresh} 
                className={`btn-icon p-2 ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} rounded-xl ${refreshing ? 'spinning' : ''}`}
              >
                <RefreshCw size={16} className={`${colors.textMuted} ${refreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="p-6">
              {localToken ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg transition-transform hover:scale-105 ${
                      localToken.provider === 'Google' ? 'bg-gradient-to-br from-red-500 to-orange-500 shadow-red-500/25' :
                      localToken.provider === 'Github' ? 'bg-gradient-to-br from-gray-700 to-gray-900 shadow-gray-500/25' :
                      'bg-gradient-to-br from-blue-500 to-purple-600 shadow-blue-500/25'
                    }`}>
                      {localToken.provider?.[0] || 'K'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${colors.text} text-lg`}>{localToken.provider || '未知'}</span>
                        <span className={`px-2.5 py-1 ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'} rounded-full text-xs font-medium pulse-ring`}>{t('home.loggedIn')}</span>
                      </div>
                      <div className={`text-sm ${colors.textMuted} mt-1`}>{localToken.authMethod || 'social'}</div>
                    </div>
                  </div>
                  
                  <div className={`${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-4 space-y-3`}>
                    <div className="flex items-center justify-between text-sm">
                      <span className={colors.textMuted}>Access Token</span>
                      <span title={localToken.accessToken} className={`font-mono text-xs ${colors.textMuted} truncate max-w-[180px] cursor-help`}>
                        {localToken.accessToken?.substring(0, 20)}...
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className={colors.textMuted}>Refresh Token</span>
                      <span title={localToken.refreshToken} className={`font-mono text-xs ${colors.textMuted} truncate max-w-[180px] cursor-help`}>
                        {localToken.refreshToken?.substring(0, 20)}...
                      </span>
                    </div>
                    {localToken.authMethod === 'IdC' ? (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <span className={colors.textMuted}>Client ID Hash</span>
                          <span title={localToken.clientIdHash} className={`font-mono text-xs ${colors.textMuted} truncate max-w-[180px] cursor-help`}>
                            {localToken.clientIdHash || '-'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className={colors.textMuted}>Region</span>
                          <span className={`font-mono text-xs ${colors.textMuted}`}>
                            {localToken.region || '-'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center justify-between text-sm">
                        <span className={colors.textMuted}>Profile ARN</span>
                        <span title={localToken.profileArn} className={`font-mono text-xs ${colors.textMuted} truncate max-w-[180px] cursor-help`}>
                          {localToken.profileArn || '-'}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className={colors.textMuted}>{t('home.expiresAt')}</span>
                      <span className={`${colors.text} flex items-center gap-1`}>
                        <Clock size={12} />
                        {localToken.expiresAt ? new Date(localToken.expiresAt).toLocaleString() : '未知'}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className={`w-20 h-20 ${isDark ? 'bg-white/10' : 'bg-gray-100'} rounded-full flex items-center justify-center mx-auto mb-4 animate-float`}>
                    <Users size={32} className={colors.textMuted} />
                  </div>
                  <div className={`${colors.textMuted} mb-1 font-medium`}>{t('home.notLoggedIn')}</div>
                  <div className={`text-sm ${colors.textMuted}`}>{t('home.clickToSwitch')}</div>
                </div>
              )}
            </div>
          </div>

          {/* 配额总览 - 紧凑版 */}
          <div className={`card-glow ${colors.card} rounded-2xl shadow-sm border ${colors.cardBorder} p-5 animate-scale-in delay-400`}>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
                <TrendingUp size={20} className="text-emerald-500" />
              </div>
              <h2 className={`font-semibold ${colors.text}`}>{t('home.quotaOverview')}</h2>
            </div>
            <div className="flex items-center gap-4 mb-3">
              <div className="flex-1">
                <div className={`h-3 ${isDark ? 'bg-white/10' : 'bg-gray-100'} rounded-full overflow-hidden`}>
                  <div 
                    className={`h-full rounded-full transition-all duration-1000 ease-out ${
                      stats.usagePercent > 80 ? 'bg-gradient-to-r from-red-400 to-red-500' : 
                      stats.usagePercent > 50 ? 'bg-gradient-to-r from-yellow-400 to-orange-500' : 
                      'bg-gradient-to-r from-green-400 to-emerald-500'
                    }`}
                    style={{ width: `${stats.usagePercent}%` }}
                  />
                </div>
              </div>
              <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${
                stats.usagePercent > 80 
                  ? (isDark ? 'bg-red-500/20 text-red-400' : 'bg-red-100 text-red-600') 
                  : stats.usagePercent > 50 
                    ? (isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700') 
                    : (isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600')
              }`}>
                {stats.usagePercent}%
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className={colors.textMuted}>{t('home.usedTotal')}</span>
              <span className={`font-medium ${colors.text}`}>{stats.totalUsed} / {stats.totalQuota}</span>
            </div>
          </div>
        </div>

        {/* 当前账号配额详情 */}
        {localToken && currentAccount && (() => {
          const usageData = currentAccount.usageData
          const breakdown = usageData?.usageBreakdownList?.[0] || usageData?.usageBreakdown
          const subInfo = usageData?.subscriptionInfo
          const userInfo = usageData?.userInfo
          const overageConfig = usageData?.overageConfiguration
          const freeTrial = breakdown?.freeTrialInfo
          const bonuses = breakdown?.bonuses || []
          const mainUsed = breakdown?.currentUsage ?? 0
          const mainLimit = breakdown?.usageLimit ?? 0
          const mainPercent = mainLimit > 0 ? Math.round((mainUsed / mainLimit) * 100) : 0
          const daysUntilReset = usageData?.daysUntilReset ?? 0
          const nextDateReset = usageData?.nextDateReset
          
          return (
            <div className={`card-glow ${colors.card} rounded-2xl shadow-sm border ${colors.cardBorder} overflow-hidden animate-scale-in delay-500`}>
              {/* 头部：用户信息 + 订阅徽章 */}
              <div className={`px-5 py-4 border-b ${colors.cardBorder} flex items-center gap-4`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md ${
                  currentAccount.provider === 'Google' ? 'bg-gradient-to-br from-red-500 to-orange-500' :
                  currentAccount.provider === 'Github' ? 'bg-gradient-to-br from-gray-700 to-gray-900' :
                  'bg-gradient-to-br from-blue-500 to-purple-600'
                }`}>
                  {currentAccount.provider?.[0] || 'K'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${colors.text} truncate`}>{userInfo?.email || currentAccount.email}</span>
                    {subInfo?.type && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                        subInfo.type.includes('PRO+') ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white' :
                        subInfo.type.includes('PRO') ? 'bg-blue-500 text-white' :
                        (isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-700')
                      }`}>
                        {subInfo.subscriptionTitle || 'Free'}
                      </span>
                    )}
                  </div>
                  <div className={`text-xs ${colors.textMuted} mt-0.5`}>{currentAccount.provider} · {daysUntilReset} {t('home.daysUntilReset')}</div>
                </div>
              </div>
              
              <div className="p-5">
                {/* 本月用量进度 - 突出显示 */}
                <div className={`${isDark ? 'bg-gradient-to-r from-blue-500/10 to-purple-500/10' : 'bg-gradient-to-r from-blue-50 to-purple-50'} rounded-xl p-4 mb-4`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-sm font-medium ${colors.text}`}>{t('home.monthlyUsage')}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-lg font-bold ${
                        currentPercent > 80 ? 'text-red-500' : currentPercent > 50 ? 'text-amber-500' : (isDark ? 'text-blue-400' : 'text-blue-600')
                      }`}>{currentPercent}%</span>
                      <span className={`text-xs ${colors.textMuted}`}>{currentUsed} / {currentQuota}</span>
                    </div>
                  </div>
                  <div className={`h-2.5 ${isDark ? 'bg-white/10' : 'bg-white'} rounded-full overflow-hidden shadow-inner`}>
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        currentPercent > 80 ? 'bg-gradient-to-r from-red-400 to-red-500' : 
                        currentPercent > 50 ? 'bg-gradient-to-r from-amber-400 to-orange-500' : 
                        'bg-gradient-to-r from-blue-400 to-purple-500'
                      }`}
                      style={{ width: `${currentPercent}%` }}
                    />
                  </div>
                </div>

                {/* 两列布局：订阅详情 + 账户信息 */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {/* 订阅详情 */}
                  {subInfo && (
                    <div className={`${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg p-3`}>
                      <div className={`text-[10px] font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'} mb-2 uppercase tracking-wide`}>{t('home.subscriptionDetails')}</div>
                      <div className="space-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className={colors.textMuted}>{t('home.type')}</span>
                          <span className={colors.text}>{subInfo.subscriptionTitle || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={colors.textMuted}>{t('home.overage')}</span>
                          <span className={`${subInfo.overageCapability === 'OVERAGE_CAPABLE' ? 'text-green-500' : colors.textMuted}`}>
                            {subInfo.overageCapability === 'OVERAGE_CAPABLE' ? '✓' : '✗'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className={colors.textMuted}>{t('home.upgrade')}</span>
                          <span className={`${subInfo.upgradeCapability === 'UPGRADE_CAPABLE' ? 'text-green-500' : colors.textMuted}`}>
                            {subInfo.upgradeCapability === 'UPGRADE_CAPABLE' ? '✓' : '✗'}
                          </span>
                        </div>
                        {overageConfig && (
                          <div className="flex justify-between">
                            <span className={colors.textMuted}>{t('home.status')}</span>
                            <span className={`${overageConfig.overageStatus === 'ENABLED' ? 'text-green-500' : colors.textMuted}`}>
                              {overageConfig.overageStatus === 'ENABLED' ? t('home.enabled') : t('home.disabled')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 账户信息 */}
                  <div className={`${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg p-3`}>
                    <div className={`text-[10px] font-medium ${isDark ? 'text-purple-400' : 'text-purple-600'} mb-2 uppercase tracking-wide`}>{t('home.accountInfo')}</div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex justify-between">
                        <span className={colors.textMuted}>IDP</span>
                        <span className={colors.text}>{currentAccount.provider || '-'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className={colors.textMuted}>{t('home.reset')}</span>
                        <span className={colors.text}>{nextDateReset ? new Date(nextDateReset * 1000).toLocaleDateString() : '-'}</span>
                      </div>
                      {breakdown?.overageRate && (
                        <div className="flex justify-between">
                          <span className={colors.textMuted}>{t('home.rate')}</span>
                          <span className={colors.text}>${breakdown.overageRate}/次</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className={colors.textMuted}>ID</span>
                        <span className={`${colors.text} font-mono truncate max-w-[80px]`} title={userInfo?.userId}>{userInfo?.userId?.split('.').pop()?.substring(0, 8) || '-'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 额度明细 - 紧凑横向布局 */}
                <div className={`${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-lg p-3`}>
                  <div className={`text-[10px] font-medium ${colors.text} mb-2 uppercase tracking-wide`}>{t('home.quotaDetails')}</div>
                  <div className="space-y-2">
                    {/* 基础额度 */}
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
                      <span className={`text-xs ${colors.textMuted} w-14 shrink-0`}>{t('home.base')}</span>
                      <div className={`flex-1 h-1.5 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
                        <div className="h-full rounded-full bg-blue-500 transition-all" style={{ width: `${mainPercent}%` }} />
                      </div>
                      <span className={`text-[10px] ${colors.textMuted} w-16 text-right shrink-0`}>{mainUsed}/{mainLimit}</span>
                    </div>

                    {/* 试用额度 */}
                    {freeTrial && freeTrial.usageLimit > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                        <span className={`text-xs text-purple-500 w-14 shrink-0`}>{t('home.trial')}</span>
                        <div className={`flex-1 h-1.5 ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'} rounded-full overflow-hidden`}>
                          <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${freeTrial.usageLimit > 0 ? ((freeTrial.currentUsage ?? 0) / freeTrial.usageLimit * 100) : 0}%` }} />
                        </div>
                        <span className={`text-[10px] text-purple-500 w-16 text-right shrink-0`}>{freeTrial.currentUsage ?? 0}/{freeTrial.usageLimit}</span>
                      </div>
                    )}

                    {/* 奖励额度 */}
                    {bonuses.map((bonus, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                        <span className={`text-xs text-amber-600 w-14 shrink-0 truncate`} title={bonus.displayName}>{bonus.displayName?.substring(0, 4) || `奖励${idx+1}`}</span>
                        <div className={`flex-1 h-1.5 ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'} rounded-full overflow-hidden`}>
                          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${bonus.usageLimit > 0 ? ((bonus.currentUsage ?? 0) / bonus.usageLimit * 100) : 0}%` }} />
                        </div>
                        <span className={`text-[10px] text-amber-600 w-16 text-right shrink-0`}>{bonus.currentUsage ?? 0}/{bonus.usageLimit ?? 0}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

      </div>
    </div>
  )
}

export default Home
