import { createContext, useContext, useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

const ThemeContext = createContext()

export const themes = {
  light: {
    name: '浅色',
    sidebar: 'bg-gradient-to-b from-[#4361ee] to-[#3651de]',
    sidebarText: 'text-white',
    sidebarHover: 'hover:bg-white/10',
    sidebarActive: 'bg-white text-[#4361ee]',
    sidebarBorder: 'border-white/20',
    sidebarMuted: 'text-blue-200/60',
    sidebarCard: 'bg-white/10',
    main: 'bg-gradient-to-br from-gray-50 to-gray-100',
    card: 'bg-white',
    cardBorder: 'border-gray-100',
    text: 'text-gray-800',
    textMuted: 'text-gray-500',
    input: 'bg-white border-gray-200',
    inputFocus: 'focus:ring-blue-500/20 focus:border-blue-500',
    // 次要按钮样式
    btnSecondary: 'bg-gray-100 hover:bg-gray-200 border-gray-300',
    iconColor: '#1a1a1a',
  },
  dark: {
    name: '深色',
    sidebar: 'bg-gradient-to-b from-[#1a1a2e] to-[#16162a]',
    sidebarText: 'text-white',
    sidebarHover: 'hover:bg-white/10',
    sidebarActive: 'bg-blue-600 text-white',
    sidebarBorder: 'border-white/10',
    sidebarMuted: 'text-gray-400',
    sidebarCard: 'bg-white/5',
    main: 'bg-[#0f0f1a]',
    card: 'bg-[#1a1a2e]',
    cardBorder: 'border-gray-800',
    text: 'text-gray-100',
    textMuted: 'text-gray-400',
    input: 'bg-[#252540] border-gray-700',
    inputFocus: 'focus:ring-blue-500/30 focus:border-blue-500',
    // 次要按钮样式
    btnSecondary: 'bg-[#1a1a1a] hover:bg-[#252525] border-[#333]',
    iconColor: 'white',
  },
  purple: {
    name: '紫色',
    sidebar: 'bg-gradient-to-b from-[#7c3aed] to-[#6d28d9]',
    sidebarText: 'text-white',
    sidebarHover: 'hover:bg-white/10',
    sidebarActive: 'bg-white text-[#7c3aed]',
    sidebarBorder: 'border-white/20',
    sidebarMuted: 'text-purple-200/60',
    sidebarCard: 'bg-white/10',
    main: 'bg-gradient-to-br from-purple-50 via-violet-50 to-fuchsia-50',
    card: 'bg-white/90 backdrop-blur-sm',
    cardBorder: 'border-purple-200/60',
    text: 'text-purple-900',
    textMuted: 'text-purple-500',
    input: 'bg-purple-50/50 border-purple-200',
    inputFocus: 'focus:ring-purple-500/30 focus:border-purple-500',
    accent: 'text-purple-600',
    accentBg: 'bg-purple-500',
    // 登录按钮样式
    loginBtn: 'bg-purple-100 hover:bg-purple-200 border-purple-300',
    loginBtnIcon: '#6d28d9',
  },
  green: {
    name: '绿色',
    sidebar: 'bg-gradient-to-b from-[#059669] to-[#047857]',
    sidebarText: 'text-white',
    sidebarHover: 'hover:bg-white/10',
    sidebarActive: 'bg-white text-[#059669]',
    sidebarBorder: 'border-white/20',
    sidebarMuted: 'text-emerald-200/60',
    sidebarCard: 'bg-white/10',
    main: 'bg-gradient-to-br from-emerald-50 via-green-50 to-teal-50',
    card: 'bg-white/90 backdrop-blur-sm',
    cardBorder: 'border-emerald-200/60',
    text: 'text-emerald-900',
    textMuted: 'text-emerald-600',
    input: 'bg-emerald-50/50 border-emerald-200',
    inputFocus: 'focus:ring-emerald-500/30 focus:border-emerald-500',
    accent: 'text-emerald-600',
    accentBg: 'bg-emerald-500',
    // 登录按钮样式
    loginBtn: 'bg-emerald-100 hover:bg-emerald-200 border-emerald-300',
    loginBtnIcon: '#047857',
  },
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('dark')
  const [loaded, setLoaded] = useState(false)

  // 从文件加载设置
  useEffect(() => {
    invoke('get_app_settings').then(settings => {
      if (settings?.theme && themes[settings.theme]) {
        setThemeState(settings.theme)
      }
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [])

  // 保存设置到文件
  const setTheme = (newTheme) => {
    setThemeState(newTheme)
    invoke('get_app_settings').then(settings => {
      invoke('save_app_settings', { settings: { ...settings, theme: newTheme } })
    }).catch(() => {
      invoke('save_app_settings', { settings: { theme: newTheme } })
    })
  }

  useEffect(() => {
    document.body.className = theme === 'dark' ? 'dark' : ''
  }, [theme])

  const value = {
    theme,
    setTheme,
    colors: themes[theme],
    themes,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used within ThemeProvider')
  return context
}
