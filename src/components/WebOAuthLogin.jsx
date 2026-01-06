import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Loader, ClipboardPaste, Globe, Sparkles, ArrowRight, ExternalLink, CheckCircle2 } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../i18n.jsx'

function WebOAuthLogin({ onLogin }) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const [step, setStep] = useState('idle') // idle, webview, completing
  const [loadingProvider, setLoadingProvider] = useState(null)
  const [callbackUrl, setCallbackUrl] = useState('')
  const [error, setError] = useState('')
  const [windowLabel, setWindowLabel] = useState(null)

  useEffect(() => {
    const unlistenSuccess = listen('login-success', (event) => {
      console.log('Web OAuth login success:', event.payload)
      setStep('idle')
      setLoadingProvider(null)
      setCallbackUrl('')
      setWindowLabel(null)
      onLogin?.(event.payload)
    })

    const unlistenCallback = listen('web-oauth-callback', async (event) => {
      console.log('web-oauth-callback:', event.payload)
      setStep('completing')
      try {
        await invoke('web_oauth_complete', { callbackUrl: event.payload })
      } catch (e) {
        console.error('Auto complete failed:', e)
        setError(typeof e === 'string' ? e : e.message || t('login.failed'))
        setCallbackUrl(event.payload)
        setStep('webview')
      }
    })

    return () => {
      unlistenSuccess.then(fn => fn())
      unlistenCallback.then(fn => fn())
    }
  }, [onLogin])

  const handleLogin = async (provider) => {
    setLoadingProvider(provider)
    setError('')
    setStep('webview')
    
    try {
      const result = await invoke('web_oauth_login', { provider })
      setWindowLabel(result.windowLabel)
    } catch (e) {
      console.error('Web OAuth login error:', e)
      setError(typeof e === 'string' ? e : e.message || t('login.failed'))
      setStep('idle')
      setLoadingProvider(null)
    }
  }

  const handleComplete = async () => {
    if (!callbackUrl.trim()) {
      setError(t('webOAuth.manualInput'))
      return
    }
    setStep('completing')
    setError('')
    
    if (windowLabel) {
      try {
        await invoke('web_oauth_close_window', { windowLabel })
      } catch (e) {}
    }
    
    try {
      await invoke('web_oauth_complete', { callbackUrl: callbackUrl.trim() })
    } catch (e) {
      console.error('Web OAuth complete error:', e)
      setError(typeof e === 'string' ? e : e.message || t('login.failed'))
      setStep('webview')
    }
  }

  const handleCancel = async () => {
    if (windowLabel) {
      try {
        await invoke('web_oauth_close_window', { windowLabel })
      } catch (e) {}
    }
    setStep('idle')
    setLoadingProvider(null)
    setCallbackUrl('')
    setWindowLabel(null)
    setError('')
  }

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText()
      setCallbackUrl(text)
    } catch (e) {}
  }

  const providers = [
    {
      id: 'Google',
      name: 'Google',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
      gradient: 'from-[#4285F4] to-[#34A853]',
      hoverBorder: 'hover:border-[#4285F4]',
    },
    {
      id: 'Github',
      name: 'GitHub',
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" className={isDark ? 'fill-white' : 'fill-gray-900'}>
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
      gradient: 'from-gray-700 to-gray-900',
      hoverBorder: 'hover:border-gray-500',
    },
  ]

  return (
    <div className={`h-full flex flex-col items-center justify-center ${colors.main} relative overflow-hidden`}>
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/10 via-transparent to-transparent rounded-full blur-3xl" />
        <div className="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-blue-500/10 via-transparent to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10 animate-zoom-in">
          <div className={`
            w-20 h-20 rounded-3xl mb-5
            bg-gradient-to-br from-purple-500 to-indigo-600
            flex items-center justify-center
            shadow-2xl shadow-purple-500/30
            animate-float
          `}>
            <Globe size={40} className="text-white" strokeWidth={1.5} />
          </div>
          <h1 className={`${colors.text} text-2xl font-bold mb-2`}>{t('webOAuth.title')}</h1>
          <p className={`${colors.textMuted} text-sm`}>{t('webOAuth.subtitle')}</p>
        </div>

        {/* Error */}
        {error && (
          <div className={`
            mb-6 px-4 py-3 rounded-xl text-sm text-center
            ${isDark ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-red-50 text-red-600 border border-red-200'}
          `}>
            {error}
          </div>
        )}

        {/* 选择登录 */}
        {step === 'idle' && (
          <div className="space-y-3 animate-slide-in-right delay-100">
            {providers.map((provider) => (
              <button
                key={provider.id}
                onClick={() => handleLogin(provider.id)}
                disabled={!!loadingProvider}
                className={`
                  group w-full relative flex items-center justify-center gap-3 px-5 py-4
                  ${isDark ? 'bg-white/5 hover:bg-white/10 border-white/10' : 'bg-white hover:bg-gray-50 border-gray-200'}
                  border ${provider.hoverBorder}
                  rounded-2xl transition-all duration-300
                  disabled:opacity-50 disabled:cursor-not-allowed
                  hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
                `}
              >
                {provider.icon}
                <span className={`${colors.text} font-semibold`}>{provider.name}</span>
                <span className={`absolute right-5 ${colors.textMuted} text-sm opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1`}>
                  {t('login.signIn')} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
                </span>
              </button>
            ))}
          </div>
        )}

        {/* WebView 登录中 */}
        {step === 'webview' && (
          <div className="space-y-4">
            {/* 主状态卡片 */}
            <div className={`
              p-6 rounded-2xl text-center
              ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'}
              shadow-xl
            `}>
              <div className="relative w-16 h-16 mx-auto mb-5">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-2xl animate-pulse opacity-20" />
                <div className="absolute inset-2 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <ExternalLink size={24} className="text-white" />
                </div>
              </div>
              <h3 className={`${colors.text} font-semibold text-lg mb-2`}>{t('webOAuth.authorizing')}</h3>
              <p className={`${colors.textMuted} text-sm mb-4`}>
                {t('webOAuth.loggingWith', { provider: loadingProvider })}
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-purple-500">
                <Loader size={14} className="animate-spin" />
                <span>{t('webOAuth.waitingCallback')}</span>
              </div>
            </div>

            {/* 备用手动输入 */}
            <div className={`
              p-5 rounded-2xl
              ${isDark ? 'bg-white/[0.02] border border-white/5' : 'bg-gray-50/50 border border-gray-100'}
            `}>
              <p className={`${colors.textMuted} text-xs mb-3 flex items-center gap-2`}>
                <Sparkles size={12} />
                {t('webOAuth.manualInput')}
              </p>
              <div className="flex gap-2 mb-3">
                <input
                  type="text"
                  value={callbackUrl}
                  onChange={(e) => setCallbackUrl(e.target.value)}
                  placeholder="https://app.kiro.dev/signin/oauth?code=..."
                  className={`
                    flex-1 px-4 py-2.5 rounded-xl text-xs
                    ${isDark ? 'bg-white/5 border-white/10 text-white placeholder:text-white/30' : 'bg-white border-gray-200 text-gray-900 placeholder:text-gray-400'}
                    border focus:outline-none focus:ring-2 focus:ring-purple-500/50 transition-all
                  `}
                />
                <button
                  onClick={handlePaste}
                  className={`
                    px-3.5 py-2.5 rounded-xl transition-all
                    ${isDark ? 'bg-white/5 hover:bg-white/10 border-white/10' : 'bg-white hover:bg-gray-50 border-gray-200'}
                    border hover:border-purple-500
                  `}
                  title="粘贴"
                >
                  <ClipboardPaste size={16} className={colors.textMuted} />
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCancel}
                  className={`
                    flex-1 px-4 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${isDark ? 'bg-white/5 hover:bg-white/10 text-white border-white/10' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'}
                    border
                  `}
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleComplete}
                  disabled={!callbackUrl.trim()}
                  className={`
                    flex-1 px-4 py-2.5 rounded-xl text-sm font-medium text-white transition-all
                    bg-gradient-to-r from-purple-500 to-indigo-600
                    hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed
                    shadow-lg shadow-purple-500/25
                  `}
                >
                  {t('webOAuth.complete')}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 完成中 */}
        {step === 'completing' && (
          <div className={`
            p-8 rounded-2xl text-center
            ${isDark ? 'bg-white/5 border border-white/10' : 'bg-white border border-gray-200'}
            shadow-xl
          `}>
            <div className="relative w-20 h-20 mx-auto mb-5">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl animate-pulse opacity-30" />
              <div className="absolute inset-2 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center">
                <CheckCircle2 size={32} className="text-white" />
              </div>
            </div>
            <h3 className={`${colors.text} font-semibold text-lg mb-2`}>{t('webOAuth.completing')}</h3>
            <p className={`${colors.textMuted} text-sm`}>{t('webOAuth.verifying')}</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <p className={`absolute bottom-6 text-xs ${colors.textMuted} text-center animate-blur-in delay-300`}>
        {t('webOAuth.footer')}
      </p>
    </div>
  )
}

export default WebOAuthLogin
