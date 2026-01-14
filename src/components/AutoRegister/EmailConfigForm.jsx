import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Mail, Server, Lock, Clock, RefreshCw, Check, X } from 'lucide-react'

function EmailConfigForm({ config, onChange, colors, isDark, t }) {
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const testConnection = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const result = await invoke('test_email_connection', { 
        imapServer: config.imapServer,
        imapPort: config.imapPort,
        email: config.email,
        password: config.password,
        useSsl: config.useSsl
      })
      setTestResult({ success: result, message: t('autoRegister.emailTestSuccess') })
    } catch (err) {
      setTestResult({ success: false, message: err.toString() })
    } finally {
      setTesting(false)
    }
  }

  return (
    <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
      <div className="flex items-center gap-2 mb-1">
        <Mail size={18} className="text-blue-500" />
        <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.emailConfig')}</h2>
      </div>
      <p className={`text-sm ${colors.textMuted} mb-5`}>{t('autoRegister.emailConfigDesc')}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* IMAP 服务器 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>
            <Server size={14} className="inline mr-1" />
            {t('autoRegister.imapServer')}
          </label>
          <input
            type="text"
            value={config.imapServer}
            onChange={(e) => onChange({ imapServer: e.target.value })}
            placeholder="imap.gmail.com"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>

        {/* IMAP 端口 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.imapPort')}</label>
          <input
            type="number"
            value={config.imapPort}
            onChange={(e) => onChange({ imapPort: parseInt(e.target.value) || 993 })}
            placeholder="993"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>

        {/* 邮箱地址 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.emailAddress')}</label>
          <input
            type="email"
            value={config.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="your@email.com"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>

        {/* 邮箱密码 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>
            <Lock size={14} className="inline mr-1" />
            {t('autoRegister.emailPassword')}
          </label>
          <input
            type="password"
            value={config.password}
            onChange={(e) => onChange({ password: e.target.value })}
            placeholder="••••••••"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>

        {/* 超时时间 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>
            <Clock size={14} className="inline mr-1" />
            {t('autoRegister.timeout')} ({t('common.seconds')})
          </label>
          <input
            type="number"
            value={config.timeout}
            onChange={(e) => onChange({ timeout: parseInt(e.target.value) || 120 })}
            placeholder="120"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>

        {/* 轮询间隔 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>
            {t('autoRegister.pollInterval')} ({t('common.seconds')})
          </label>
          <input
            type="number"
            value={config.pollInterval}
            onChange={(e) => onChange({ pollInterval: parseInt(e.target.value) || 5 })}
            placeholder="5"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>
      </div>

      {/* SSL 选项 */}
      <label className={`flex items-center gap-3 mt-4 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all`}>
        <input
          type="checkbox"
          checked={config.useSsl}
          onChange={(e) => onChange({ useSsl: e.target.checked })}
          className="w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
        />
        <Lock size={16} className={colors.textMuted} />
        <div>
          <span className={`text-sm font-medium ${colors.text}`}>{t('autoRegister.useSsl')}</span>
          <p className={`text-xs ${colors.textMuted}`}>{t('autoRegister.useSslDesc')}</p>
        </div>
      </label>

      {/* 测试连接 */}
      <div className="mt-4 flex items-center gap-4">
        <button
          onClick={testConnection}
          disabled={testing || !config.imapServer || !config.email || !config.password}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all disabled:opacity-50 ${
            isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
          } ${colors.text}`}
        >
          {testing ? <RefreshCw size={16} className="animate-spin" /> : <Mail size={16} />}
          {testing ? t('autoRegister.testing') : t('autoRegister.testConnection')}
        </button>

        {testResult && (
          <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-green-500' : 'text-red-500'}`}>
            {testResult.success ? <Check size={16} /> : <X size={16} />}
            {testResult.message}
          </div>
        )}
      </div>
    </section>
  )
}

export default EmailConfigForm
