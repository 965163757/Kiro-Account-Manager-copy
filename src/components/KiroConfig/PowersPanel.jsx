import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import { useI18n } from '../../i18n.jsx'
import { Package, Tag, Calendar, User, Download, Trash2, RefreshCw, Check } from 'lucide-react'

function PowersPanel() {
  const { theme, colors } = useTheme()
  const { showConfirm, showError, showSuccess } = useDialog()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const [allPowers, setAllPowers] = useState([])
  const [loading, setLoading] = useState(true)
  const [operating, setOperating] = useState(null) // 正在操作的 power name

  const loadPowers = useCallback(async () => {
    try {
      const all = await invoke('get_all_powers')
      setAllPowers(all || [])
    } catch (e) {
      console.error('加载 Powers 失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPowers()
  }, [loadPowers])

  const handleInstall = async (power) => {
    setOperating(power.name)
    try {
      await invoke('install_power', { name: power.name })
      await showSuccess(t('common.success'), `${power.displayName || power.name} ${t('powers.installed')}`)
      loadPowers()
    } catch (e) {
      await showError(t('common.error'), e.toString())
    } finally {
      setOperating(null)
    }
  }

  const handleUninstall = async (power) => {
    const confirmed = await showConfirm(t('powers.confirmUninstall'), `${power.displayName || power.name}?`)
    if (!confirmed) return

    setOperating(power.name)
    try {
      await invoke('uninstall_power', { name: power.name })
      await showSuccess(t('powers.uninstallSuccess'), `${power.displayName || power.name}`)
      loadPowers()
    } catch (e) {
      await showError(t('powers.uninstallFailed'), e.toString())
    } finally {
      setOperating(null)
    }
  }

  const installedCount = allPowers.filter(p => p.installed).length

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className={`px-6 py-3 border-b ${colors.cardBorder} flex items-center justify-between`}>
        <span className={`text-sm ${colors.textMuted}`}>
          {installedCount} / {allPowers.length} {t('powers.installed')}
        </span>
        <button
          onClick={loadPowers}
          disabled={loading}
          className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
        >
          <RefreshCw size={16} className={`${colors.textMuted} ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className={`text-center py-12 ${colors.textMuted}`}>{t('common.loading')}</div>
        ) : allPowers.length === 0 ? (
          <div className="text-center py-12">
            <Package size={48} className={`mx-auto mb-4 ${colors.textMuted} opacity-50`} />
            <p className={colors.textMuted}>{t('powers.noPowers')}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {allPowers.map((power) => (
              <PowerCard
                key={power.name}
                power={power}
                isDark={isDark}
                colors={colors}
                t={t}
                operating={operating === power.name}
                onInstall={() => handleInstall(power)}
                onUninstall={() => handleUninstall(power)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PowerCard({ power, isDark, colors, t, operating, onInstall, onUninstall }) {
  return (
    <div className={`${colors.card} border ${colors.cardBorder} rounded-xl p-4 flex flex-col h-full ${power.installed ? 'ring-1 ring-green-500/30' : ''}`}>
      {/* 头部 */}
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center ${
          power.installed 
            ? (isDark ? 'bg-green-500/20' : 'bg-green-50')
            : (isDark ? 'bg-white/10' : 'bg-gray-100')
        }`}>
          {power.installed ? (
            <Check size={20} className="text-green-500" />
          ) : (
            <Package size={20} className={colors.textMuted} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${colors.text} truncate`}>{power.displayName || power.name}</h3>
          <p className={`text-sm ${colors.textMuted} mt-0.5 line-clamp-2 min-h-[2.5rem]`}>
            {power.description || '-'}
          </p>
        </div>
      </div>

      {/* 中间信息 - 自动撑开 */}
      <div className="mt-3 space-y-1 flex-1">
        {power.author && (
          <div className={`flex items-center gap-2 text-xs ${colors.textMuted}`}>
            <User size={12} /><span>{power.author}</span>
          </div>
        )}
        {power.installedAt && (
          <div className={`flex items-center gap-2 text-xs ${colors.textMuted}`}>
            <Calendar size={12} /><span>{new Date(power.installedAt).toLocaleDateString()}</span>
          </div>
        )}
        {power.keywords?.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {power.keywords.slice(0, 3).map((kw, i) => (
              <span key={i} className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                {kw}
              </span>
            ))}
            {power.keywords.length > 3 && (
              <span className={`text-xs ${colors.textMuted}`}>+{power.keywords.length - 3}</span>
            )}
          </div>
        )}
      </div>

      {/* 操作按钮 - 固定在底部 */}
      <div className={`mt-4 pt-3 border-t ${isDark ? 'border-white/10' : 'border-gray-200'}`}>
        {power.installed ? (
          <button
            onClick={onUninstall}
            disabled={operating}
            className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${isDark ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-50 text-red-600 hover:bg-red-100'}
              disabled:opacity-50`}
          >
            {operating ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {t('powers.uninstall')}
          </button>
        ) : (
          <button
            onClick={onInstall}
            disabled={operating}
            className={`w-full py-2 px-4 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2
              ${isDark ? 'bg-blue-500/80 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-600'} text-white disabled:opacity-50`}
          >
            {operating ? <RefreshCw size={14} className="animate-spin" /> : <Download size={14} />}
            {t('common.add')}
          </button>
        )}
      </div>
    </div>
  )
}

export default PowersPanel
