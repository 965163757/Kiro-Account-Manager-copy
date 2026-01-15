import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Play, Square, RefreshCw, Clock, Hash, Terminal, AlertTriangle, CheckCircle } from 'lucide-react'

function ExecutionPanel({
  config,
  isRunning,
  setIsRunning,
  progress,
  logs,
  setLogs,
  logsEndRef,
  colors,
  isDark,
  t,
  showError,
  showSuccess,
  showConfirm,
  onHistoryUpdate
}) {
  const [count, setCount] = useState(config.execution?.count || 1)
  const [interval, setInterval] = useState(config.execution?.interval || 10)
  const [starting, setStarting] = useState(false)
  const [stopping, setStopping] = useState(false)

  const startRegistration = async () => {
    // 验证配置
    if (!config.email?.imapServer || !config.email?.email || !config.email?.password) {
      await showError(t('autoRegister.configError'), t('autoRegister.emailConfigRequired'))
      return
    }
    if (!config.register?.emailPrefix || !config.register?.emailDomain) {
      await showError(t('autoRegister.configError'), t('autoRegister.registerConfigRequired'))
      return
    }

    const confirmed = await showConfirm(
      t('autoRegister.startConfirm'),
      t('autoRegister.startConfirmDesc', { count })
    )
    if (!confirmed) return

    setStarting(true)
    setLogs([])
    try {
      // 先重置状态，清除之前的错误状态
      try {
        await invoke('reset_auto_register_state')
      } catch (e) {
        // 忽略重置失败（可能是首次运行没有状态）
        console.log('Reset state skipped:', e)
      }
      await invoke('start_auto_register', { count, interval })
      setIsRunning(true)
    } catch (err) {
      await showError(t('autoRegister.startFailed'), err.toString())
    } finally {
      setStarting(false)
    }
  }

  const stopRegistration = async () => {
    const confirmed = await showConfirm(
      t('autoRegister.stopConfirm'),
      t('autoRegister.stopConfirmDesc')
    )
    if (!confirmed) return

    setStopping(true)
    try {
      await invoke('stop_auto_register')
      setIsRunning(false)
      onHistoryUpdate()
    } catch (err) {
      await showError(t('autoRegister.stopFailed'), err.toString())
    } finally {
      setStopping(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'running': return 'text-blue-500'
      case 'completed': return 'text-green-500'
      case 'error': return 'text-red-500'
      case 'paused': return 'text-yellow-500'
      default: return colors.textMuted
    }
  }

  const getStatusIcon = (status) => {
    switch (status) {
      case 'running': return <RefreshCw size={16} className="animate-spin" />
      case 'completed': return <CheckCircle size={16} />
      case 'error': return <AlertTriangle size={16} />
      default: return null
    }
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 执行配置 */}
      <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
        <div className="flex items-center gap-2 mb-1">
          <Play size={18} className="text-green-500" />
          <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.executionConfig')}</h2>
        </div>
        <p className={`text-sm ${colors.textMuted} mb-5`}>{t('autoRegister.executionConfigDesc')}</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          {/* 注册数量 */}
          <div>
            <label className={`block text-sm ${colors.textMuted} mb-2`}>
              <Hash size={14} className="inline mr-1" />
              {t('autoRegister.registerCount')}
            </label>
            <input
              type="number"
              value={count}
              onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
              min={1}
              max={100}
              disabled={isRunning}
              className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all disabled:opacity-50`}
            />
          </div>

          {/* 间隔时间 */}
          <div>
            <label className={`block text-sm ${colors.textMuted} mb-2`}>
              <Clock size={14} className="inline mr-1" />
              {t('autoRegister.registerInterval')} ({t('common.seconds')})
            </label>
            <input
              type="number"
              value={interval}
              onChange={(e) => setInterval(Math.max(5, parseInt(e.target.value) || 10))}
              min={5}
              disabled={isRunning}
              className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all disabled:opacity-50`}
            />
          </div>
        </div>

        {/* 控制按钮 */}
        <div className="flex gap-4">
          {!isRunning ? (
            <button
              onClick={startRegistration}
              disabled={starting}
              className="flex-1 px-6 py-3 bg-green-500 text-white rounded-xl font-medium hover:bg-green-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {starting ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
              {starting ? t('autoRegister.starting') : t('autoRegister.start')}
            </button>
          ) : (
            <button
              onClick={stopRegistration}
              disabled={stopping}
              className="flex-1 px-6 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {stopping ? <RefreshCw size={18} className="animate-spin" /> : <Square size={18} />}
              {stopping ? t('autoRegister.stopping') : t('autoRegister.stop')}
            </button>
          )}
        </div>
      </section>

      {/* 进度显示 */}
      {(isRunning || progress) && (
        <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <RefreshCw size={18} className={isRunning ? 'text-blue-500 animate-spin' : 'text-green-500'} />
              <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.progress')}</h2>
            </div>
            {progress && (
              <div className={`flex items-center gap-2 ${getStatusColor(progress.status)}`}>
                {getStatusIcon(progress.status)}
                <span className="text-sm font-medium">{t(`autoRegister.status.${progress.status}`)}</span>
              </div>
            )}
          </div>

          {progress && (
            <>
              {/* 进度条 */}
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-2">
                  <span className={colors.textMuted}>{progress.current_step || t('autoRegister.preparing')}</span>
                  <span className={colors.text}>{progress.current_index} / {progress.total_count}</span>
                </div>
                <div className={`h-2 rounded-full ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}>
                  <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${(progress.current_index / progress.total_count) * 100}%` }}
                  />
                </div>
              </div>

              {/* 错误信息 */}
              {progress.error && (
                <div className={`p-3 rounded-xl ${isDark ? 'bg-red-500/20' : 'bg-red-50'} text-red-500 text-sm flex items-start gap-2`}>
                  <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                  {progress.error}
                </div>
              )}
            </>
          )}
        </section>
      )}

      {/* 日志输出 */}
      <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
        <div className="flex items-center gap-2 mb-4">
          <Terminal size={18} className="text-gray-500" />
          <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.logs')}</h2>
          {logs.length > 0 && (
            <button
              onClick={() => setLogs([])}
              className={`ml-auto text-xs ${colors.textMuted} hover:underline`}
            >
              {t('autoRegister.clearLogs')}
            </button>
          )}
        </div>

        <div className={`h-64 overflow-auto rounded-xl p-4 font-mono text-sm ${isDark ? 'bg-black/30' : 'bg-gray-900'} text-gray-300`}>
          {logs.length === 0 ? (
            <div className="text-gray-500 text-center py-8">{t('autoRegister.noLogs')}</div>
          ) : (
            logs.map((log, index) => (
              <div key={index} className="py-0.5">
                <span className="text-gray-500">[{new Date().toLocaleTimeString()}]</span> {log}
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>
      </section>
    </div>
  )
}

export default ExecutionPanel
