import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n'
import { Sparkles, Package, Tag, Calendar, User, ExternalLink } from 'lucide-react'

function PowersManager() {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const [powers, setPowers] = useState({})
  const [loading, setLoading] = useState(true)

  const loadPowers = useCallback(async () => {
    try {
      const registry = await invoke('get_powers_registry')
      setPowers(registry.powers || {})
    } catch (e) {
      console.error('加载 Powers 失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPowers()
  }, [loadPowers])

  const powerList = Object.entries(powers)

  return (
    <div className={`h-full flex flex-col ${colors.main}`}>
      {/* 头部 */}
      <div className={`${colors.card} border-b ${colors.cardBorder} px-6 py-4`}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/20">
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h1 className={`text-xl font-bold ${colors.text}`}>Powers</h1>
            <p className={`text-sm ${colors.textMuted}`}>{t('powersManager.subtitle')}</p>
          </div>
          <div className={`ml-auto px-3 py-1 rounded-lg ${isDark ? 'bg-amber-500/20 text-amber-300' : 'bg-amber-50 text-amber-700'} text-sm`}>
            {powerList.length} {t('powersManager.installed')}
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className={`text-center py-12 ${colors.textMuted}`}>{t('common.loading')}</div>
        ) : powerList.length === 0 ? (
          <div className="text-center py-12">
            <Package size={48} className={`mx-auto mb-4 ${colors.textMuted} opacity-50`} />
            <p className={colors.textMuted}>{t('powersManager.noPowers')}</p>
            <p className={`text-sm ${colors.textMuted} mt-1`}>{t('powersManager.installInKiro')}</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {powerList.map(([id, power]) => (
              <PowerCard key={id} id={id} power={power} isDark={isDark} colors={colors} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PowerCard({ id, power, isDark, colors }) {
  return (
    <div className={`${colors.card} border ${colors.cardBorder} rounded-xl p-4 transition-all hover:shadow-lg`}>
      <div className="flex items-start gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-amber-500/20' : 'bg-amber-50'}`}>
          <Package size={20} className="text-amber-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className={`font-semibold ${colors.text} truncate`}>{power.name || id}</h3>
          {power.description && (
            <p className={`text-sm ${colors.textMuted} mt-0.5 line-clamp-2`}>{power.description}</p>
          )}
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {power.version && (
          <div className={`flex items-center gap-2 text-xs ${colors.textMuted}`}>
            <Tag size={12} />
            <span>v{power.version}</span>
          </div>
        )}
        {power.publisher && (
          <div className={`flex items-center gap-2 text-xs ${colors.textMuted}`}>
            <User size={12} />
            <span>{power.publisher}</span>
          </div>
        )}
        {power.installedAt && (
          <div className={`flex items-center gap-2 text-xs ${colors.textMuted}`}>
            <Calendar size={12} />
            <span>{new Date(power.installedAt).toLocaleDateString()}</span>
          </div>
        )}
      </div>

      {power.keywords?.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {power.keywords.slice(0, 4).map((kw, i) => (
            <span 
              key={i} 
              className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-white/10 text-gray-300' : 'bg-gray-100 text-gray-600'}`}
            >
              {kw}
            </span>
          ))}
          {power.keywords.length > 4 && (
            <span className={`text-xs ${colors.textMuted}`}>+{power.keywords.length - 4}</span>
          )}
        </div>
      )}
    </div>
  )
}

export default PowersManager
