import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Loader, ArrowRight, X } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useI18n } from '../i18n.jsx'

function Login({ onLogin }) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const [loadingProvider, setLoadingProvider] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const unlistenSuccess = listen('login-success', (event) => {
      console.log('Login success event:', event.payload)
      setLoadingProvider(null)
      onLogin?.(event.payload)
    })
    return () => { unlistenSuccess.then(fn => fn()) }
  }, [onLogin])

  const handleLogin = async (provider) => {
    setLoadingProvider(provider)
    setError('')
    try {
      await invoke('kiro_login', { provider })
    } catch (e) {
      console.error('Login error:', e)
      setError(typeof e === 'string' ? e : e.message || t('login.failed'))
      setLoadingProvider(null)
    }
  }

  const handleCancel = () => {
    setLoadingProvider(null)
    setError('')
  }

  const providers = [
    {
      id: 'Google',
      name: 'Google',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
      ),
      color: 'hover:border-blue-400 hover:shadow-blue-500/10',
    },
    {
      id: 'Github',
      name: 'GitHub',
      icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
        </svg>
      ),
      color: 'hover:border-gray-400 hover:shadow-gray-500/10',
    },
    {
      id: 'BuilderId',
      name: 'AWS Builder ID',
      icon: <span className="text-[#ff9900] font-bold text-lg">aws</span>,
      color: 'hover:border-orange-400 hover:shadow-orange-500/10',
    },
  ]

  return (
    <div className={`h-full flex flex-col items-center justify-center ${colors.main} relative overflow-hidden`}>
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className={`absolute -top-40 -right-40 w-80 h-80 rounded-full ${isDark ? 'bg-purple-500/10' : 'bg-purple-100'} blur-3xl`} />
        <div className={`absolute -bottom-40 -left-40 w-80 h-80 rounded-full ${isDark ? 'bg-blue-500/10' : 'bg-blue-100'} blur-3xl`} />
      </div>

      <div className="relative z-10 w-full max-w-sm px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10 animate-bounce-in">
          <div className={`w-16 h-16 rounded-2xl ${isDark ? 'bg-gradient-to-br from-purple-500 to-blue-600' : 'bg-gradient-to-br from-purple-400 to-blue-500'} flex items-center justify-center mb-4 shadow-lg shadow-purple-500/25 animate-float`}>
            <svg width="32" height="32" viewBox="0 0 40 40" fill="none">
              <path d="M20 4C12 4 6 10 6 18C6 22 8 25 8 25C8 25 7 28 7 30C7 32 8 34 10 34C11 34 12 33 13 32C14 33 16 34 20 34C24 34 26 33 27 32C28 33 29 34 30 34C32 34 33 32 33 30C33 28 32 25 32 25C32 25 34 22 34 18C34 10 28 4 20 4ZM14 20C12.5 20 11 18.5 11 17C11 15.5 12.5 14 14 14C15.5 14 17 15.5 17 17C17 18.5 15.5 20 14 20ZM26 20C24.5 20 23 18.5 23 17C23 15.5 24.5 14 26 14C27.5 14 29 15.5 29 17C29 18.5 27.5 20 26 20Z" fill="white"/>
            </svg>
          </div>
          <h1 className={`${colors.text} text-2xl font-bold`}>{t('login.title')}</h1>
          <p className={`${colors.textMuted} text-sm mt-1`}>{t('login.subtitle')}</p>
        </div>

        {/* Error */}
        {error && (
          <div className={`mb-6 px-4 py-3 ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} text-red-500 border rounded-xl text-sm flex items-center gap-2`}>
            <X size={16} />
            <span className="flex-1">{error}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-3 animate-pop-up delay-100">
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleLogin(provider.id)}
              disabled={!!loadingProvider}
              className={`group w-full relative flex items-center justify-center gap-3 px-5 py-4 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} border rounded-xl transition-all duration-200 disabled:opacity-50 ${provider.color} hover:shadow-lg active:scale-[0.98]`}
            >
              {loadingProvider === provider.id ? (
                <Loader size={20} className="animate-spin text-purple-500" />
              ) : (
                provider.icon
              )}
              <span className={`${colors.text} font-medium`}>{provider.name}</span>
              <span className={`absolute right-5 ${colors.textMuted} text-sm opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1`}>
                {t('login.signIn')} <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          ))}

          {/* 取消按钮 */}
          {loadingProvider && (
            <button
              onClick={handleCancel}
              className={`w-full px-5 py-3 ${isDark ? 'bg-white/5 border-white/10 hover:bg-white/10' : 'bg-white border-gray-200 hover:bg-gray-50'} border rounded-xl transition-colors text-sm ${colors.text}`}
            >
              {t('login.cancel')}
            </button>
          )}
        </div>

        {/* Footer */}
        <p className={`mt-10 text-xs ${colors.textMuted} text-center leading-relaxed animate-blur-in delay-300`}>
          {t('login.agreement')}{' '}
          <a href="https://aws.amazon.com/agreement/" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">{t('login.awsAgreement')}</a>、
          <a href="https://aws.amazon.com/service-terms/" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">{t('login.serviceTerms')}</a> {t('login.and')}{' '}
          <a href="https://aws.amazon.com/privacy/" target="_blank" rel="noopener noreferrer" className="text-purple-500 hover:underline">{t('login.privacy')}</a>
        </p>
      </div>
    </div>
  )
}

export default Login
