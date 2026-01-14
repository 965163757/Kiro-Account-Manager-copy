import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Shield, Server, Lock, RefreshCw, Check, X } from 'lucide-react'

function ProxyConfigForm({ config, browserType, onChange, colors, isDark, t }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  // Chrome 模式下才显示代理配置
  if (browserType !== 'chrome') {
    return null
  }

  const testProxy = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await invoke('test_proxy_connection', { config })
      setTestResult({ success: result, message: t('autoRegister.proxyTestSuccess') })
    } catch (err) {
      setTestResult({ success: false, message: err.toString() })
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
      <div className="flex items-center gap-2 mb-1">
        <Shield size={18} className="text-cyan-500" />
        <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.proxyConfig')}</h2>
      </div>
      <p className={`text-sm ${colors.textMuted} mb-5`}>{t('autoRegister.proxyConfigDesc')}</p>

      {/* 启用代理 */}
      <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all mb-4`}>
        <input
          type="checkbox"
          checked={config.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
        />
        <Shield size={16} className={colors.textMuted} />
        <div>
          <span className={`text-sm font-medium ${colors.text}`}>{t('autoRegister.enableProxy')}</span>
          <p className={`text-xs ${colors.textMuted}`}>{t('autoRegister.enableProxyDesc')}</p>
        </div>
      </label>

      {config.enabled && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* 代理类型 */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.proxyType')}</label>
              <select
                value={config.proxyType}
                onChange={(e) => onChange({ proxyType: e.target.value })}
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 appearance-none cursor-pointer transition-all`}
              >
                <option value="http">HTTP</option>
                <option value="https">HTTPS</option>
                <option value="socks5">SOCKS5</option>
              </select>
            </div>

            {/* 代理端口 */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.proxyPort')}</label>
              <input
                type="number"
                value={config.port}
                onChange={(e) => onChange({ port: parseInt(e.target.value) || 7890 })}
                placeholder="7890"
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>

            {/* 代理主机 */}
            <div className="col-span-2">
              <label className={`block text-sm ${colors.textMuted} mb-2`}>
                <Server size={14} className="inline mr-1" />
                {t('autoRegister.proxyHost')}
              </label>
              <input
                type="text"
                value={config.host}
                onChange={(e) => onChange({ host: e.target.value })}
                placeholder="127.0.0.1"
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>

            {/* 代理用户名 */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>
                {t('autoRegister.proxyUsername')} ({t('autoRegister.optional')})
              </label>
              <input
                type="text"
                value={config.username || ''}
                onChange={(e) => onChange({ username: e.target.value })}
                placeholder={t('autoRegister.optional')}
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>

            {/* 代理密码 */}
            <div>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>
                <Lock size={14} className="inline mr-1" />
                {t('autoRegister.proxyPassword')} ({t('autoRegister.optional')})
              </label>
              <input
                type="password"
                value={config.password || ''}
                onChange={(e) => onChange({ password: e.target.value })}
                placeholder="••••••••"
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
            </div>
          </div>

          {/* 测试代理 */}
          <div className="flex items-center gap-4">
            <button
              onClick={testProxy}
              disabled={testing || !config.host || !config.port}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all disabled:opacity-50 ${
                isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
              } ${colors.text}`}
            >
              {testing ? <RefreshCw size={16} className="animate-spin" /> : <Shield size={16} />}
              {testing ? t('autoRegister.testing') : t('autoRegister.testProxy')}
            </button>

            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
                {testResult.success ? <Check size={16} /> : <X size={16} />}
                {testResult.message}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}

export default ProxyConfigForm
