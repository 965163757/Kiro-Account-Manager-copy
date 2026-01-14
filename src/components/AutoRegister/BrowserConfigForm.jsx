import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Globe, Chrome, Search, RefreshCw, Check, X, Fingerprint } from 'lucide-react'

function BrowserConfigForm({ config, onChange, colors, isDark, t }) {
  const [detecting, setDetecting] = useState(false)
  const [checkingRoxy, setCheckingRoxy] = useState(false)
  const [roxyStatus, setRoxyStatus] = useState(null)

  const detectChrome = async () => {
    setDetecting(true)
    try {
      const path = await invoke('detect_chrome')
      if (path) {
        onChange({ chromePath: path })
      }
    } catch (err) {
      console.error('Failed to detect Chrome:', err)
    } finally {
      setDetecting(false)
    }
  }

  const checkRoxyService = async () => {
    setCheckingRoxy(true)
    setRoxyStatus(null)
    try {
      const running = await invoke('check_roxy_service', { port: config.roxyPort || 17071 })
      setRoxyStatus({ running, message: running ? t('autoRegister.roxyRunning') : t('autoRegister.roxyNotRunning') })
    } catch (err) {
      setRoxyStatus({ running: false, message: err.toString() })
    } finally {
      setCheckingRoxy(false)
    }
  }

  return (
    <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
      <div className="flex items-center gap-2 mb-1">
        <Globe size={18} className="text-orange-500" />
        <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.browserConfig')}</h2>
      </div>
      <p className={`text-sm ${colors.textMuted} mb-5`}>{t('autoRegister.browserConfigDesc')}</p>

      {/* 浏览器类型选择 */}
      <div className="mb-5">
        <label className={`block text-sm ${colors.textMuted} mb-3`}>{t('autoRegister.browserType')}</label>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => onChange({ browserType: 'chrome' })}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              config.browserType === 'chrome'
                ? 'border-blue-500 bg-blue-500/10'
                : `${isDark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'}`
            }`}
          >
            <Chrome size={24} className={config.browserType === 'chrome' ? 'text-blue-500' : colors.textMuted} />
            <div className="text-left">
              <div className={`font-medium ${colors.text}`}>Chrome {t('autoRegister.incognito')}</div>
              <div className={`text-xs ${colors.textMuted}`}>{t('autoRegister.chromeDesc')}</div>
            </div>
          </button>

          <button
            onClick={() => onChange({ browserType: 'roxy' })}
            className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
              config.browserType === 'roxy'
                ? 'border-purple-500 bg-purple-500/10'
                : `${isDark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'}`
            }`}
          >
            <Fingerprint size={24} className={config.browserType === 'roxy' ? 'text-purple-500' : colors.textMuted} />
            <div className="text-left">
              <div className={`font-medium ${colors.text}`}>Roxy {t('autoRegister.fingerprint')}</div>
              <div className={`text-xs ${colors.textMuted}`}>{t('autoRegister.roxyDesc')}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Chrome 配置 */}
      {config.browserType === 'chrome' && (
        <div className="space-y-4">
          {/* 自动检测 */}
          <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all`}>
            <input
              type="checkbox"
              checked={config.chromeAutoDetect}
              onChange={(e) => onChange({ chromeAutoDetect: e.target.checked })}
              className="w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <Search size={16} className={colors.textMuted} />
            <div>
              <span className={`text-sm font-medium ${colors.text}`}>{t('autoRegister.autoDetectChrome')}</span>
              <p className={`text-xs ${colors.textMuted}`}>{t('autoRegister.autoDetectChromeDesc')}</p>
            </div>
          </label>

          {/* Chrome 路径 */}
          {!config.chromeAutoDetect && (
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.chromePath')}</label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={config.chromePath || ''}
                  onChange={(e) => onChange({ chromePath: e.target.value })}
                  placeholder={t('autoRegister.chromePathPlaceholder')}
                  className={`flex-1 px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
                />
                <button
                  onClick={detectChrome}
                  disabled={detecting}
                  className={`px-4 py-3 rounded-xl flex items-center gap-2 transition-all ${
                    isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
                  } ${colors.text}`}
                >
                  {detecting ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                  {t('settings.detect')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Roxy 配置 */}
      {config.browserType === 'roxy' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Roxy 端口 */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.roxyPort')}</label>
              <input
                type="number"
                value={config.roxyPort || 17071}
                onChange={(e) => onChange({ roxyPort: parseInt(e.target.value) || 17071 })}
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>

            {/* Roxy Token */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.roxyToken')}</label>
              <input
                type="password"
                value={config.roxyToken || ''}
                onChange={(e) => onChange({ roxyToken: e.target.value })}
                placeholder="••••••••"
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>

            {/* 工作空间 ID */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.roxyWorkspaceId')}</label>
              <input
                type="number"
                value={config.roxyWorkspaceId || ''}
                onChange={(e) => onChange({ roxyWorkspaceId: e.target.value ? parseInt(e.target.value) : null })}
                placeholder={t('autoRegister.optional')}
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>

            {/* 浏览器 ID */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.roxyBrowserId')}</label>
              <input
                type="text"
                value={config.roxyBrowserId || ''}
                onChange={(e) => onChange({ roxyBrowserId: e.target.value })}
                placeholder={t('autoRegister.optional')}
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>
          </div>

          {/* 检测 Roxy 服务 */}
          <div className="flex items-center gap-4">
            <button
              onClick={checkRoxyService}
              disabled={checkingRoxy}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all ${
                isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
              } ${colors.text}`}
            >
              {checkingRoxy ? <RefreshCw size={16} className="animate-spin" /> : <Fingerprint size={16} />}
              {t('autoRegister.checkRoxyService')}
            </button>

            {roxyStatus && (
              <div className={`flex items-center gap-2 text-sm ${roxyStatus.running ? 'text-green-500' : 'text-red-500'}`}>
                {roxyStatus.running ? <Check size={16} /> : <X size={16} />}
                {roxyStatus.message}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default BrowserConfigForm
