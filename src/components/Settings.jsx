import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { emit } from '@tauri-apps/api/event'
import { Lock, Copy, Sun, Moon, Palette, Check, RefreshCw, Settings as SettingsIcon, Clock, Globe, Search, Shield, Download, Upload, Shuffle, AlertTriangle } from 'lucide-react'
import { useTheme } from '../contexts/ThemeContext'
import { useDialog } from '../contexts/DialogContext'
import { useI18n } from '../i18n.jsx'

function Settings() {
  const { theme, setTheme, colors } = useTheme()
  const { showConfirm, showError, showSuccess } = useDialog()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  
  const [aiModel, setAiModel] = useState('claude-sonnet-4.5')
  const [lockModel, setLockModel] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(50) // 分钟
  const [autoChangeMachineId, setAutoChangeMachineId] = useState(false)
  const [bindMachineIdToAccount, setBindMachineIdToAccount] = useState(false)
  const [httpProxy, setHttpProxy] = useState('')
  const [originalProxy, setOriginalProxy] = useState('') // 原始代理值，用于判断是否修改
  const [savingProxy, setSavingProxy] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [browserPath, setBrowserPath] = useState('')
  const [originalBrowserPath, setOriginalBrowserPath] = useState('')
  const [savingBrowser, setSavingBrowser] = useState(false)
  const [detectedBrowsers, setDetectedBrowsers] = useState([])
  const [showBrowserList, setShowBrowserList] = useState(false)
  const [detectingProxy, setDetectingProxy] = useState(false)
  
  // Kiro IDE 状态
  const [loading, setLoading] = useState(false)
  
  // 系统机器码
  const [systemMachineInfo, setSystemMachineInfo] = useState(null)
  const [machineGuidBackup, setMachineGuidBackup] = useState(null)
  const [machineGuidLoading, setMachineGuidLoading] = useState(false)
  const [machineGuidAction, setMachineGuidAction] = useState(null) // 'backup' | 'restore' | 'reset'
  


  // 加载设置
  const loadSettings = async () => {
    setLoading(true)
    try {
      const [kiroSettings, appSettings, sysMachine] = await Promise.all([
        invoke('get_kiro_settings').catch(() => null),
        invoke('get_app_settings').catch(() => null),
        invoke('get_system_machine_guid').catch(() => null)
      ])
      setSystemMachineInfo(sysMachine)
      if (sysMachine?.backupExists) {
        const backup = await invoke('get_machine_guid_backup').catch(() => null)
        setMachineGuidBackup(backup)
      }
      // 从 Kiro IDE 设置读取
      if (kiroSettings) {
        const proxy = kiroSettings.httpProxy || ''
        setHttpProxy(proxy)
        setOriginalProxy(proxy)
        setAiModel(kiroSettings.modelSelection || 'claude-sonnet-4.5')
      }
      // 从应用设置读取
      if (appSettings) {
        setLockModel(appSettings.lockModel ?? true)
        setAutoRefresh(appSettings.autoRefresh ?? true)
        setAutoRefreshInterval(appSettings.autoRefreshInterval ?? 50)
        setAutoChangeMachineId(appSettings.autoChangeMachineId ?? false)
        setBindMachineIdToAccount(appSettings.bindMachineIdToAccount ?? false)
        const browser = appSettings.browserPath || ''
        setBrowserPath(browser)
        setOriginalBrowserPath(browser)
      }
    } catch (err) {
      console.error('Failed to load settings:', err)
      // 暂时不显示错误弹窗，避免阻塞页面
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSettings()
  }, [])

  // 保存应用设置（后端已实现增量更新，直接传入要更新的字段）
  const saveAppSettings = async (updates, notifyChange = false) => {
    try {
      await invoke('save_app_settings', { settings: updates })
      if (notifyChange) {
        await emit('settings-changed')
      }
    } catch (err) {
      console.error('Failed to save app settings:', err)
      await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
    }
  }

  const handleApplyProxy = async () => {
    setSavingProxy(true)
    try {
      await invoke('set_kiro_proxy', { proxy: httpProxy })
      setOriginalProxy(httpProxy) // 保存成功后更新原始值
      await showSuccess(t('settings.saveSuccess'), httpProxy ? t('settings.proxyApplied') : t('settings.proxyCleared'))
    } catch (err) {
      await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
    } finally {
      setSavingProxy(false)
    }
  }
  
  // 代理是否有修改
  const proxyChanged = httpProxy !== originalProxy

  const handleApplyModel = async (model) => {
    setAiModel(model)
    setSavingModel(true)
    try {
      await invoke('set_kiro_model', { model })
      // 如果锁定模型，保存到应用设置
      if (lockModel) {
        await saveAppSettings({ locked_model: model })
      }
    } catch (err) {
      await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
    } finally {
      setSavingModel(false)
    }
  }

  const handleLockModelChange = async (checked) => {
    setLockModel(checked)
    await saveAppSettings({ lock_model: checked, locked_model: checked ? aiModel : null })
  }

  const handleAutoRefreshChange = async (checked) => {
    setAutoRefresh(checked)
    await saveAppSettings({ autoRefresh: checked }, true)
  }

  const handleAutoRefreshIntervalChange = async (value) => {
    const interval = parseInt(value) || 50
    setAutoRefreshInterval(interval)
    await saveAppSettings({ autoRefreshInterval: interval }, true)
    await saveAppSettings({ autoRefreshInterval: interval })
  }

  const handleAutoChangeMachineIdChange = async (checked) => {
    setAutoChangeMachineId(checked)
    await saveAppSettings({ autoChangeMachineId: checked })
  }

  const handleBindMachineIdChange = async (checked) => {
    setBindMachineIdToAccount(checked)
    await saveAppSettings({ bindMachineIdToAccount: checked })
  }

  const handleApplyBrowser = async () => {
    setSavingBrowser(true)
    try {
      await saveAppSettings({ browserPath: browserPath })
      setOriginalBrowserPath(browserPath)
      await showSuccess(t('settings.saveSuccess'), browserPath ? t('settings.browserSaved') : t('settings.defaultBrowser'))
    } catch (err) {
      await showError(t('settings.saveFailed'), t('settings.saveFailed') + ': ' + err)
    } finally {
      setSavingBrowser(false)
    }
  }

  const browserChanged = browserPath !== originalBrowserPath

  const handleDetectBrowsers = async () => {
    try {
      const browsers = await invoke('detect_installed_browsers')
      setDetectedBrowsers(browsers)
      setShowBrowserList(true)
      if (browsers.length === 0) {
        await showError(t('settings.detectFailed'), t('settings.noBrowserFound'))
      }
    } catch (err) {
      await showError(t('settings.detectFailed'), t('settings.detectFailed') + ': ' + err)
    }
  }

  // 检测系统代理
  const handleDetectProxy = async () => {
    setDetectingProxy(true)
    try {
      const proxyInfo = await invoke('detect_system_proxy')
      if (proxyInfo.enabled && proxyInfo.httpProxy) {
        setHttpProxy(proxyInfo.httpProxy)
        await showSuccess(t('settings.detectSuccess'), `${t('settings.systemProxyDetected')}: ${proxyInfo.httpProxy}`)
      } else if (proxyInfo.proxyServer) {
        // 代理已配置但未启用
        const useIt = await showConfirm(t('settings.proxyConfigured'), `${t('settings.proxyNotEnabled')}: ${proxyInfo.proxyServer}\n\n${t('settings.useThisProxy')}`)
        if (useIt) {
          const proxy = proxyInfo.proxyServer.startsWith('http') ? proxyInfo.proxyServer : `http://${proxyInfo.proxyServer}`
          setHttpProxy(proxy)
        }
      } else {
        await showError(t('settings.noProxyDetected'), t('settings.noProxyConfigured'))
      }
    } catch (err) {
      await showError(t('settings.detectFailed'), t('settings.detectFailed') + ': ' + err)
    } finally {
      setDetectingProxy(false)
    }
  }

  const handleSelectBrowser = (browser, useIncognito = true) => {
    const path = useIncognito && browser.incognitoArg 
      ? `"${browser.path}" ${browser.incognitoArg}`
      : `"${browser.path}"`
    setBrowserPath(path)
    setShowBrowserList(false)
  }

  const [kiroRunning, setKiroRunning] = useState(false)

  // 检查 Kiro IDE 运行状态
  const checkKiroStatus = async () => {
    try {
      const running = await invoke('is_kiro_ide_running')
      setKiroRunning(running)
    } catch (err) {
      console.error('Failed to check Kiro status:', err)
    }
  }

  useEffect(() => {
    checkKiroStatus()
    // 每30秒检查一次，页面不可见时跳过
    const interval = setInterval(() => {
      if (!document.hidden) checkKiroStatus()
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // 手动关闭/启动 Kiro IDE
  const handleToggleKiro = async () => {
    try {
      if (kiroRunning) {
        await invoke('close_kiro_ide')
      } else {
        await invoke('start_kiro_ide')
      }
      await new Promise(r => setTimeout(r, 500))
      checkKiroStatus()
    } catch (err) {
      await showError(t('common.error'), err.toString())
    }
  }

  // 系统机器码操作
  const handleBackupMachineGuid = async () => {
    setMachineGuidAction('backup')
    try {
      const backup = await invoke('backup_machine_guid')
      setMachineGuidBackup(backup)
      setSystemMachineInfo(prev => ({ ...prev, backupExists: true, backupTime: backup.backupTime }))
      await showSuccess(t('settings.backupSuccess'), `${t('settings.machineGuidBackedUp')}: ${backup.machineGuid}`)
    } catch (err) {
      await showError(t('settings.backupFailed'), err.toString())
    } finally {
      setMachineGuidAction(null)
    }
  }

  const handleRestoreMachineGuid = async () => {
    if (!machineGuidBackup) {
      await showError(t('settings.restoreFailed'), t('settings.noBackupFound'))
      return
    }
    const confirmed = await showConfirm(
      t('settings.restoreMachineGuid'),
      `${t('settings.confirmRestoreMachineGuid')}\n\n${t('settings.backupValue')}: ${machineGuidBackup.machineGuid}\n${t('settings.backupTime')}: ${machineGuidBackup.backupTime}\n\n⚠️ ${t('settings.requiresAdmin')}`,
      { confirmText: t('settings.restore'), cancelText: t('common.cancel') }
    )
    if (!confirmed) return
    
    setMachineGuidAction('restore')
    try {
      const restored = await invoke('restore_machine_guid')
      setSystemMachineInfo(prev => ({ ...prev, machineGuid: restored }))
      await showSuccess(t('settings.restoreSuccess'), `${t('settings.machineGuidRestored')}: ${restored}`)
    } catch (err) {
      await showError(t('settings.restoreFailed'), err.toString())
    } finally {
      setMachineGuidAction(null)
    }
  }

  const handleResetSystemMachineGuid = async () => {
    const confirmed = await showConfirm(
      `⚠️ ${t('settings.resetSystemMachineGuid')}`,
      t('settings.confirmResetSystemMachineGuid'),
      { confirmText: t('settings.confirmReset'), cancelText: t('common.cancel') }
    )
    if (!confirmed) return
    
    setMachineGuidAction('reset')
    try {
      const newGuid = await invoke('reset_system_machine_guid')
      setSystemMachineInfo(prev => ({ ...prev, machineGuid: newGuid }))
      await showSuccess(t('settings.resetSuccess'), `${t('settings.newMachineGuid')}: ${newGuid}`)
    } catch (err) {
      await showError(t('settings.resetFailed'), err.toString())
    } finally {
      setMachineGuidAction(null)
    }
  }

  // 格式化时间戳
  const formatTimestamp = (ts) => {
    if (!ts) return '-'
    const date = new Date(ts * 1000)
    return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const themeOptions = [
    { key: 'light', name: t('settings.light'), icon: Sun, color: 'from-blue-400 to-blue-600' },
    { key: 'dark', name: t('settings.dark'), icon: Moon, color: 'from-gray-700 to-gray-900' },
    { key: 'purple', name: t('settings.purple'), icon: Palette, color: 'from-purple-500 to-purple-700' },
    { key: 'green', name: t('settings.green'), icon: Palette, color: 'from-emerald-500 to-emerald-700' },
  ]

  // 复制到剪贴板
  const [copiedField, setCopiedField] = useState(null)
  const copyToClipboard = (text, field) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 1500)
  }

  // 信息项组件
  const InfoItem = ({ label, value, copyable = false, fieldKey }) => (
    <div className={`flex items-center justify-between py-2 ${isDark ? 'border-white/5' : 'border-gray-100'} border-b last:border-0`}>
      <span className={`text-sm ${colors.textMuted}`}>{label}</span>
      <div className="flex items-center gap-2">
        <code className={`text-xs ${isDark ? 'bg-white/10' : 'bg-gray-100'} px-2 py-1 rounded-lg font-mono ${colors.text} max-w-[200px] truncate`}>
          {value || '-'}
        </code>
        {copyable && value && (
          <button 
            onClick={() => copyToClipboard(value, fieldKey)}
            className={`btn-icon p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
          >
            {copiedField === fieldKey ? (
              <Check size={14} className="text-green-500" />
            ) : (
              <Copy size={14} className={colors.textMuted} />
            )}
          </button>
        )}
      </div>
    </div>
  )

  return (
    <div className={`h-full ${colors.main} p-8 overflow-auto`}>
      {/* 背景装饰 */}
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />
      
      <div className="max-w-3xl mx-auto relative">
        {/* Header */}
        <div className="mb-8 animate-slide-in-left">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-gray-500 to-gray-700 rounded-2xl flex items-center justify-center shadow-lg animate-float">
              <SettingsIcon size={24} className="text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${colors.text}`}>{t('settings.title')}</h1>
              <p className={colors.textMuted}>{t('settings.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* 主题设置 */}
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder} mb-6 animate-slide-in-left delay-100`}>
          <h2 className={`text-lg font-semibold ${colors.text} mb-1`}>{t('settings.theme')}</h2>
          <p className={`text-sm ${colors.textMuted} mb-5`}>{t('settings.themeDesc')}</p>
          
          <div className="grid grid-cols-4 gap-3">
            {themeOptions.map((opt, index) => {
              const Icon = opt.icon
              const isActive = theme === opt.key
              return (
                <button
                  key={opt.key}
                  onClick={() => setTheme(opt.key)}
                  className={`relative p-4 rounded-xl border-2 transition-all hover:scale-105 ${
                    isActive 
                      ? 'border-blue-500 shadow-lg shadow-blue-500/20' 
                      : `${isDark ? 'border-gray-700 hover:border-gray-600' : 'border-gray-200 hover:border-gray-300'}`
                  }`}
                  style={{ animationDelay: `${index * 0.05}s` }}
                >
                  <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${opt.color} flex items-center justify-center mx-auto mb-2 transition-transform group-hover:scale-110`}>
                    <Icon size={20} className="text-white" />
                  </div>
                  <div className={`text-sm font-medium ${colors.text}`}>{opt.name}</div>
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center animate-scale-in">
                      <Check size={12} className="text-white" />
                    </div>
                  )}
                </button>
              )
            })}
          </div>
        </section>

        {/* 模型设置 */}
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder} mb-6 animate-slide-in-left delay-200`}>
          <h2 className={`text-lg font-semibold ${colors.text} mb-1`}>{t('settings.model')}</h2>
          <p className={`text-sm ${colors.textMuted} mb-5`}>{t('settings.modelDesc')}</p>
          
          <div className="mb-5">
            <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('settings.aiModel')} {savingModel && <span className="text-blue-500 text-xs ml-2">{t('settings.saving')}</span>}</label>
            <div className="relative">
              <select
                value={aiModel}
                onChange={(e) => handleApplyModel(e.target.value)}
                disabled={savingModel}
                className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 appearance-none cursor-pointer disabled:opacity-50 transition-all`}
              >
                <option value="claude-sonnet-4.5">Claude Sonnet 4.5 - 1.3x (⭐ {t('common.recommended')})</option>
                <option value="claude-sonnet-4">Claude Sonnet 4 - 1.3x</option>
                <option value="claude-haiku-4.5">Claude Haiku 4.5 - 0.4x</option>
                <option value="claude-opus-4.5">Claude Opus 4.5 - 2.2x</option>
              </select>
              <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2.5 4.5L6 8L9.5 4.5" stroke={isDark ? '#888' : '#666'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
            </div>
          </div>

          <label className={`flex items-start gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all hover:scale-[1.01]`}>
            <input
              type="checkbox"
              checked={lockModel}
              onChange={(e) => handleLockModelChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <Lock size={16} className={`${colors.textMuted} mt-0.5 flex-shrink-0`} />
            <div>
              <span className={`text-sm font-medium ${colors.text}`}>{t('settings.lockModel')}</span>
              <p className={`text-xs ${colors.textMuted} mt-0.5`}>{t('settings.lockModelDesc')}</p>
            </div>
          </label>
        </section>

        {/* 账号设置 */}
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder} mb-6 animate-slide-in-left delay-300`}>
          <h2 className={`text-lg font-semibold ${colors.text} mb-1`}>{t('settings.account')}</h2>
          <p className={`text-sm ${colors.textMuted} mb-5`}>{t('settings.accountDesc')}</p>
          
          <label className={`flex items-start gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all hover:scale-[1.01] mb-3`}>
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => handleAutoRefreshChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <Clock size={16} className={`${colors.textMuted} mt-0.5 flex-shrink-0`} />
            <div className="flex-1">
              <span className={`text-sm font-medium ${colors.text}`}>{t('settings.autoRefresh')}</span>
              <p className={`text-xs ${colors.textMuted} mt-0.5`}>{t('settings.autoRefreshDesc')}</p>
            </div>
          </label>

          {autoRefresh && (
            <div className={`ml-7 mb-3 p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('settings.refreshInterval')}</label>
              <select
                value={autoRefreshInterval}
                onChange={(e) => handleAutoRefreshIntervalChange(e.target.value)}
                className={`w-full px-4 py-2 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 appearance-none cursor-pointer transition-all`}
              >
                <option value="30">30 {t('common.minutes')}</option>
                <option value="50">50 {t('common.minutes')} ({t('common.recommended')})</option>
                <option value="60">60 {t('common.minutes')}</option>
                <option value="120">2 {t('common.hours')}</option>
              </select>
            </div>
          )}

          <label className={`flex items-start gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all hover:scale-[1.01] mb-3`}>
            <input
              type="checkbox"
              checked={autoChangeMachineId}
              onChange={(e) => handleAutoChangeMachineIdChange(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <Shuffle size={16} className={`${colors.textMuted} mt-0.5 flex-shrink-0`} />
            <div>
              <span className={`text-sm font-medium ${colors.text}`}>{t('settings.autoChangeMachineId')}</span>
              <p className={`text-xs ${colors.textMuted} mt-0.5`}>{t('settings.autoChangeMachineIdDesc')}</p>
            </div>
          </label>

          {autoChangeMachineId && (
            <label className={`flex items-start gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all hover:scale-[1.01] ml-7`}>
              <input
                type="checkbox"
                checked={bindMachineIdToAccount}
                onChange={(e) => handleBindMachineIdChange(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
              />
              <Lock size={16} className={`${colors.textMuted} mt-0.5 flex-shrink-0`} />
              <div>
                <span className={`text-sm font-medium ${colors.text}`}>{t('settings.bindMachineId')}</span>
                <p className={`text-xs ${colors.textMuted} mt-0.5`}>{t('settings.bindMachineIdDesc')}</p>
              </div>
            </label>
          )}
        </section>

        {/* 浏览器设置 */}
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder} mb-6 animate-slide-in-left delay-350`}>
          <div className="flex items-center gap-2 mb-1">
            <Globe size={18} className="text-blue-500" />
            <h2 className={`text-lg font-semibold ${colors.text}`}>{t('settings.browser')}</h2>
          </div>
          <p className={`text-sm ${colors.textMuted} mb-5`}>
            {t('settings.browserDesc')}
          </p>
          
          <div className="mb-3">
            <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('settings.browserPath')}</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={browserPath}
                onChange={(e) => setBrowserPath(e.target.value)}
                placeholder={t('settings.browserPlaceholder')}
                className={`flex-1 px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
              <button
                onClick={handleDetectBrowsers}
                className={`btn-icon px-4 py-3 border rounded-xl ${isDark ? 'border-gray-700 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'} ${colors.text} transition-all flex items-center gap-2`}
                title={t('settings.detectBrowsersTitle')}
              >
                <Search size={16} />
                {t('settings.detect')}
              </button>
              <button
                onClick={handleApplyBrowser}
                disabled={savingBrowser || !browserChanged}
                className={`btn-icon px-5 py-3 rounded-xl flex items-center gap-2 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                  browserChanged 
                    ? 'bg-blue-500 text-white hover:bg-blue-600' 
                    : `${isDark ? 'bg-white/10 text-white/50' : 'bg-gray-200 text-gray-400'}`
                }`}
              >
                {savingBrowser ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                {savingBrowser ? t('settings.saving') : t('settings.apply')}
              </button>
            </div>
          </div>

          {/* 检测到的浏览器列表 */}
          {showBrowserList && detectedBrowsers.length > 0 && (
            <div className={`mt-4 p-4 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
              <div className="flex items-center justify-between mb-3">
                <span className={`text-sm font-medium ${colors.text}`}>{t('settings.detectedBrowsers')}</span>
                <button 
                  onClick={() => setShowBrowserList(false)}
                  className={`text-xs ${colors.textMuted} hover:underline`}
                >
                  {t('settings.close')}
                </button>
              </div>
              <div className="space-y-2">
                {detectedBrowsers.map((browser, index) => (
                  <div key={index} className={`flex items-center justify-between p-3 rounded-lg ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-white hover:bg-gray-100'} transition-colors`}>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${colors.text}`}>{browser.name}</div>
                      <div className={`text-xs ${colors.textMuted} truncate`}>{browser.path}</div>
                    </div>
                    <div className="flex gap-2 ml-3">
                      {browser.incognitoArg && (
                        <button
                          onClick={() => handleSelectBrowser(browser, true)}
                          className="btn-icon px-3 py-1.5 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
                        >
                          {t('settings.incognitoMode')}
                        </button>
                      )}
                      <button
                        onClick={() => handleSelectBrowser(browser, false)}
                        className={`btn-icon px-3 py-1.5 text-xs rounded-lg transition-colors ${isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'} ${colors.text}`}
                      >
                        {t('settings.normalMode')}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className={`text-xs ${colors.textMuted} mt-3`}>
            {t('settings.browserTip')}
          </p>
        </section>

        {/* 代理设置 */}
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder} mb-6 animate-slide-in-left delay-400`}>
          <h2 className={`text-lg font-semibold ${colors.text} mb-1`}>{t('settings.proxy')}</h2>
          <p className={`text-sm ${colors.textMuted} mb-5`}>
            {t('settings.proxyDesc')}
          </p>
          
          <div className="mb-3">
            <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('settings.httpProxy')}</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={httpProxy}
                onChange={(e) => setHttpProxy(e.target.value)}
                placeholder="http://127.0.0.1:7897"
                className={`flex-1 px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
              />
              <button
                onClick={handleDetectProxy}
                disabled={detectingProxy}
                className={`btn-icon px-4 py-3 border rounded-xl ${isDark ? 'border-gray-700 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'} ${colors.text} transition-all flex items-center gap-2`}
                title={t('settings.detectProxyTitle')}
              >
                {detectingProxy ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
                {t('settings.detect')}
              </button>
              <button
                onClick={handleApplyProxy}
                disabled={savingProxy || !proxyChanged}
                className={`btn-icon px-5 py-3 rounded-xl flex items-center gap-2 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed transition-all ${
                  proxyChanged 
                    ? 'bg-blue-500 text-white hover:bg-blue-600' 
                    : `${isDark ? 'bg-white/10 text-white/50' : 'bg-gray-200 text-gray-400'}`
                }`}
              >
                {savingProxy ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                {savingProxy ? t('settings.saving') : t('settings.apply')}
              </button>
              <button 
                onClick={loadSettings}
                className={`btn-icon px-4 py-3 border rounded-xl ${isDark ? 'border-gray-700 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'} ${colors.textMuted} transition-all`}
              >
                ↻
              </button>
            </div>
          </div>
          <p className={`text-xs ${colors.textMuted}`}>
            {t('settings.proxyTip')}
          </p>
        </section>

        {/* Kiro IDE 状态 */}
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder} mb-6 animate-slide-in-left delay-500`}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className={`text-lg font-semibold ${colors.text} mb-1`}>{t('settings.kiroInfo')}</h2>
              <p className={`text-sm ${colors.textMuted}`}>{t('settings.kiroInfoDesc')}</p>
            </div>
            <button
              onClick={loadSettings}
              disabled={loading}
              className={`btn-icon p-2 rounded-xl ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
            >
              <RefreshCw size={18} className={`${colors.textMuted} ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className={`flex items-center justify-between ${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-4`}>
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${kiroRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
              <span className={`text-sm ${colors.text}`}>Kiro IDE</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                kiroRunning 
                  ? 'bg-green-500/20 text-green-500' 
                  : `${isDark ? 'bg-white/10 text-gray-400' : 'bg-gray-200 text-gray-500'}`
              }`}>
                {kiroRunning ? t('settings.running') : t('settings.notRunning')}
              </span>
            </div>
            <button
              onClick={handleToggleKiro}
              className={`btn-icon px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                kiroRunning
                  ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
                  : 'bg-green-500/20 text-green-500 hover:bg-green-500/30'
              }`}
            >
              {kiroRunning ? t('settings.stop') : t('settings.start')}
            </button>
          </div>
        </section>

        {/* 系统机器码管理 */}
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder} mb-6 animate-slide-in-left delay-600`}>
          <div className="flex items-center gap-2 mb-1">
            <Shield size={18} className="text-orange-500" />
            <h2 className={`text-lg font-semibold ${colors.text}`}>{t('settings.systemMachineGuid')}</h2>
            {systemMachineInfo?.osType && (
              <span className={`text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-200'} ${colors.textMuted}`}>
                {systemMachineInfo.osType === 'windows' ? 'Windows' : systemMachineInfo.osType === 'macos' ? 'macOS' : 'Linux'}
              </span>
            )}
          </div>
          <p className={`text-sm ${colors.textMuted} mb-5`}>
            {systemMachineInfo?.osType === 'macos' 
              ? t('settings.machineGuidDescMac')
              : systemMachineInfo?.osType === 'linux'
              ? t('settings.machineGuidDescLinux')
              : t('settings.machineGuidDescWin')}
          </p>

          {/* 当前值 */}
          <div className={`${isDark ? 'bg-white/5' : 'bg-gray-50'} rounded-xl p-4 mb-4`}>
            <div className="flex items-center justify-between mb-3">
              <span className={`text-sm font-medium ${colors.text}`}>{t('settings.currentMachineGuid')}</span>
              <button 
                onClick={loadSettings}
                disabled={loading}
                className={`btn-icon p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'} transition-colors`}
              >
                <RefreshCw size={14} className={`${colors.textMuted} ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <code className={`flex-1 text-sm ${isDark ? 'bg-white/10' : 'bg-gray-100'} px-3 py-2 rounded-lg font-mono ${colors.text}`}>
                {systemMachineInfo?.machineGuid || t('common.loading')}
              </code>
              {systemMachineInfo?.machineGuid && (
                <button 
                  onClick={() => copyToClipboard(systemMachineInfo.machineGuid, 'sysMachineGuid')}
                  className={`btn-icon p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors`}
                >
                  {copiedField === 'sysMachineGuid' ? (
                    <Check size={16} className="text-green-500" />
                  ) : (
                    <Copy size={16} className={colors.textMuted} />
                  )}
                </button>
              )}
            </div>
          </div>

          {/* 备份信息 */}
          {machineGuidBackup && (
            <div className={`${isDark ? 'bg-blue-500/10' : 'bg-blue-50'} rounded-xl p-4 mb-4 border ${isDark ? 'border-blue-500/20' : 'border-blue-200'}`}>
              <div className="flex items-center gap-2 mb-2">
                <Download size={14} className="text-blue-500" />
                <span className={`text-sm font-medium ${colors.text}`}>{t('settings.hasBackup')}</span>
              </div>
              <div className={`text-xs ${colors.textMuted} space-y-1`}>
                <div>{t('settings.backupValue')}: <code className="font-mono">{machineGuidBackup.machineGuid}</code></div>
                <div>{t('settings.backupTime')}: {machineGuidBackup.backupTime}</div>
                {machineGuidBackup.computerName && <div>{t('settings.computerName')}: {machineGuidBackup.computerName}</div>}
              </div>
            </div>
          )}

          {/* 警告提示 - 需要管理员权限时显示 */}
          {systemMachineInfo?.requiresAdmin && (
            <div className={`flex items-start gap-3 ${isDark ? 'bg-orange-500/10' : 'bg-orange-50'} rounded-xl p-4 mb-4 border ${isDark ? 'border-orange-500/20' : 'border-orange-200'}`}>
              <AlertTriangle size={18} className="text-orange-500 flex-shrink-0 mt-0.5" />
              <div className={`text-xs ${colors.textMuted}`}>
                <p className="font-medium text-orange-500 mb-1">{t('settings.adminWarningTitle')}</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>{t('settings.adminWarning1')}</li>
                  <li>{t('settings.adminWarning2')}</li>
                  <li>{t('settings.adminWarning3')}</li>
                </ul>
              </div>
            </div>
          )}
          
          {/* macOS 提示 */}
          {systemMachineInfo?.osType === 'macos' && (
            <div className={`flex items-start gap-3 ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'} rounded-xl p-4 mb-4 border ${isDark ? 'border-blue-500/20' : 'border-blue-200'}`}>
              <Shield size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
              <div className={`text-xs ${colors.textMuted}`}>
                <p className="font-medium text-blue-500 mb-1">{t('settings.macOSNote')}</p>
                <p>{t('settings.macOSNoteDesc')}</p>
              </div>
            </div>
          )}

          {/* 操作按钮 - 可修改时显示 */}
          {systemMachineInfo?.canModify && (
            <div className="flex gap-3">
              <button
                onClick={handleBackupMachineGuid}
                disabled={machineGuidAction !== null}
                className={`flex-1 btn-icon px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-medium transition-all ${
                  isDark ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30' : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                } disabled:opacity-50`}
              >
                {machineGuidAction === 'backup' ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
                {t('settings.backup')}
              </button>
              <button
                onClick={handleRestoreMachineGuid}
                disabled={machineGuidAction !== null || !machineGuidBackup}
                className={`flex-1 btn-icon px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-medium transition-all ${
                  isDark ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'bg-green-100 text-green-600 hover:bg-green-200'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {machineGuidAction === 'restore' ? <RefreshCw size={16} className="animate-spin" /> : <Upload size={16} />}
                {t('settings.restore')}
              </button>
              <button
                onClick={handleResetSystemMachineGuid}
                disabled={machineGuidAction !== null}
                className={`flex-1 btn-icon px-4 py-3 rounded-xl flex items-center justify-center gap-2 font-medium transition-all ${
                  isDark ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-red-100 text-red-600 hover:bg-red-200'
                } disabled:opacity-50`}
              >
                {machineGuidAction === 'reset' ? <RefreshCw size={16} className="animate-spin" /> : <Shuffle size={16} />}
                {t('common.reset')}
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

export default Settings
