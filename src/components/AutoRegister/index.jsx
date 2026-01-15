import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { Bot, Play, History, Settings2, RefreshCw, Check } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import { useI18n } from '../../i18n.jsx'
import EmailConfigForm from './EmailConfigForm'
import RegisterConfigForm from './RegisterConfigForm'
import BrowserConfigForm from './BrowserConfigForm'
import ProxyConfigForm from './ProxyConfigForm'
import PythonConfigForm from './PythonConfigForm'
import ScriptEditorForm from './ScriptEditorForm'
import ExecutionPanel from './ExecutionPanel'
import HistoryPanel from './HistoryPanel'

const defaultConfig = {
  email: {
    imapServer: '',
    imapPort: 993,
    email: '',
    password: '',
    useSsl: true,
    timeout: 120,
    pollInterval: 5
  },
  register: {
    emailPrefix: '',
    emailDomain: '',
    passwordLength: 16,
    passwordIncludeUppercase: true,
    passwordIncludeLowercase: true,
    passwordIncludeNumbers: true,
    passwordIncludeSpecial: true,
    useRandomName: true
  },
  browser: {
    browserType: 'chrome',
    chromePath: '',
    chromeAutoDetect: true,
    roxyPort: 17071,
    roxyToken: '',
    roxyWorkspaceId: null,
    roxyBrowserId: ''
  },
  proxy: {
    enabled: false,
    proxyType: 'http',
    host: '',
    port: 7890,
    username: '',
    password: ''
  },
  execution: {
    count: 1,
    interval: 10
  },
  python: {
    autoDetect: true,
    pythonPath: '',
    detectedPath: '',
    detectedVersion: ''
  }
}

function AutoRegister() {
  const { theme, colors } = useTheme()
  const { showError, showSuccess, showConfirm } = useDialog()
  const { t } = useI18n()
  const isDark = theme === 'dark'

  const [activeTab, setActiveTab] = useState('config') // config, execution, history
  const [config, setConfig] = useState(defaultConfig)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(null)
  const [history, setHistory] = useState([])
  const [logs, setLogs] = useState([])
  const logsEndRef = useRef(null)

  // 加载配置
  const loadConfig = async () => {
    try {
      console.log('[AutoRegister] Loading config...')
      const savedConfig = await invoke('get_auto_register_config')
      console.log('[AutoRegister] Loaded config:', savedConfig)
      if (savedConfig) {
        // 深度合并配置，确保所有嵌套对象都正确合并
        setConfig(prev => ({
          email: { ...prev.email, ...(savedConfig.email || {}) },
          register: { ...prev.register, ...(savedConfig.register || {}) },
          browser: { ...prev.browser, ...(savedConfig.browser || {}) },
          proxy: { ...prev.proxy, ...(savedConfig.proxy || {}) },
          execution: { ...prev.execution, ...(savedConfig.execution || {}) },
          python: { ...prev.python, ...(savedConfig.python || {}) }
        }))
      }
    } catch (err) {
      console.error('[AutoRegister] Failed to load config:', err)
      // 即使加载失败也使用默认配置
    } finally {
      setLoading(false)
    }
  }

  // 加载历史记录
  const loadHistory = async () => {
    try {
      const records = await invoke('get_registration_history')
      setHistory(records || [])
    } catch (err) {
      console.error('Failed to load history:', err)
    }
  }

  // 保存配置
  const saveConfig = async () => {
    setSaving(true)
    try {
      await invoke('save_auto_register_config', { config })
      await showSuccess(t('settings.saveSuccess'), t('autoRegister.configSaved'))
    } catch (err) {
      await showError(t('settings.saveFailed'), err.toString())
    } finally {
      setSaving(false)
    }
  }

  // 更新配置
  const updateConfig = (section, updates) => {
    setConfig(prev => ({
      ...prev,
      [section]: { ...prev[section], ...updates }
    }))
  }

  useEffect(() => {
    loadConfig()
    loadHistory()

    // 监听进度事件
    const unlistenProgress = listen('auto-register-progress', (event) => {
      setProgress(event.payload)
      // 直接使用完整的日志列表，而不是追加
      if (event.payload.logs) {
        setLogs(event.payload.logs)
      }
      
      // 根据后端状态同步前端 isRunning 状态
      const status = event.payload.status
      if (status === 'error' || status === 'completed' || status === 'idle') {
        setIsRunning(false)
        // 任务完成或出错时刷新历史记录
        if (status === 'error' || status === 'completed') {
          loadHistory()
        }
      } else if (status === 'running') {
        setIsRunning(true)
      }
    })

    // 监听完成事件
    const unlistenComplete = listen('auto-register-complete', (event) => {
      setIsRunning(false)
      loadHistory()
      if (event.payload.success) {
        showSuccess(t('autoRegister.complete'), t('autoRegister.registrationComplete'))
      }
    })

    return () => {
      unlistenProgress.then(fn => fn())
      unlistenComplete.then(fn => fn())
    }
  }, [])

  // 自动滚动日志
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [logs])

  const tabs = [
    { id: 'config', label: t('autoRegister.config'), icon: Settings2 },
    { id: 'execution', label: t('autoRegister.execution'), icon: Play },
    { id: 'history', label: t('autoRegister.history'), icon: History }
  ]

  if (loading) {
    return (
      <div className={`h-full ${colors.main} flex items-center justify-center`}>
        <RefreshCw className="animate-spin text-blue-500" size={32} />
      </div>
    )
  }

  return (
    <div className={`h-full ${colors.main} p-8 overflow-auto`}>
      <div className="bg-glow bg-glow-1" />
      <div className="bg-glow bg-glow-2" />

      <div className="max-w-4xl mx-auto relative">
        {/* Header */}
        <div className="mb-8 animate-slide-in-left">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-700 rounded-2xl flex items-center justify-center shadow-lg animate-float">
              <Bot size={24} className="text-white" />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${colors.text}`}>{t('autoRegister.title')}</h1>
              <p className={colors.textMuted}>{t('autoRegister.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className={`flex gap-2 mb-6 p-1 ${isDark ? 'bg-white/5' : 'bg-gray-100'} rounded-xl`}>
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-500 text-white shadow-lg'
                    : `${colors.text} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-200'}`
                }`}
              >
                <Icon size={18} />
                <span className="font-medium">{tab.label}</span>
              </button>
            )
          })}
        </div>

        {/* Content */}
        {activeTab === 'config' && (
          <div className="space-y-6 animate-fade-in-up">
            {/* 邮箱配置 */}
            <EmailConfigForm
              config={config.email}
              onChange={(updates) => updateConfig('email', updates)}
              colors={colors}
              isDark={isDark}
              t={t}
            />

            {/* 注册配置 */}
            <RegisterConfigForm
              config={config.register}
              onChange={(updates) => updateConfig('register', updates)}
              colors={colors}
              isDark={isDark}
              t={t}
            />

            {/* 浏览器配置 */}
            <BrowserConfigForm
              config={config.browser}
              onChange={(updates) => updateConfig('browser', updates)}
              colors={colors}
              isDark={isDark}
              t={t}
            />

            {/* 代理配置 */}
            <ProxyConfigForm
              config={config.proxy}
              browserType={config.browser.browserType}
              onChange={(updates) => updateConfig('proxy', updates)}
              colors={colors}
              isDark={isDark}
              t={t}
            />

            {/* Python 环境配置 */}
            <PythonConfigForm
              config={config.python}
              onChange={(updates) => updateConfig('python', updates)}
              colors={colors}
              isDark={isDark}
              t={t}
            />

            {/* 脚本编辑器 */}
            <ScriptEditorForm
              colors={colors}
              isDark={isDark}
              t={t}
              showError={showError}
              showSuccess={showSuccess}
              showConfirm={showConfirm}
            />

            {/* 保存按钮 */}
            <div className="flex justify-end">
              <button
                onClick={saveConfig}
                disabled={saving}
                className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {saving ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
                {saving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        )}

        {activeTab === 'execution' && (
          <ExecutionPanel
            config={config}
            isRunning={isRunning}
            setIsRunning={setIsRunning}
            progress={progress}
            logs={logs}
            setLogs={setLogs}
            logsEndRef={logsEndRef}
            colors={colors}
            isDark={isDark}
            t={t}
            showError={showError}
            showSuccess={showSuccess}
            showConfirm={showConfirm}
            onHistoryUpdate={loadHistory}
          />
        )}

        {activeTab === 'history' && (
          <HistoryPanel
            history={history}
            onRefresh={loadHistory}
            colors={colors}
            isDark={isDark}
            t={t}
            showError={showError}
            showSuccess={showSuccess}
            showConfirm={showConfirm}
          />
        )}
      </div>
    </div>
  )
}

export default AutoRegister
