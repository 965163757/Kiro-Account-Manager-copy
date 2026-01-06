import { useState, useEffect, useRef } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { Download, RefreshCw, X, Sparkles, CheckCircle2 } from 'lucide-react'
import { useDialog } from '../contexts/DialogContext'
import { useI18n } from '../i18n.jsx'

function UpdateChecker() {
  const { showError } = useDialog()
  const { t } = useI18n()
  const [updateInfo, setUpdateInfo] = useState(null)
  const [installing, setInstalling] = useState(false)
  const [downloadComplete, setDownloadComplete] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [update, setUpdate] = useState(null)
  const [downloadProgress, setDownloadProgress] = useState(null)
  const [downloadSpeed, setDownloadSpeed] = useState(0)
  const lastDownloadedRef = useRef(0)
  const lastTimeRef = useRef(Date.now())

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatSpeed = (bytesPerSecond) => {
    return formatBytes(bytesPerSecond) + '/s'
  }

  const checkForUpdate = async () => {
    try {
      // 先用自定义命令检查（支持代理）
      const result = await invoke('check_update')
      console.log('[Update] 检查结果:', result)
      
      if (result.has_update && result.latest_version) {
        // 有更新，再用 Tauri updater 获取完整的 update 对象
        const updateResult = await check()
        if (updateResult) {
          setUpdate(updateResult)
          setUpdateInfo({
            version: result.latest_version,
            body: result.notes
          })
          setDismissed(false)
        }
      }
    } catch (e) {
      console.log('[Update] 检查更新失败:', e)
      // 静默处理
    }
  }

  const doUpdate = async () => {
    if (!update) return
    setInstalling(true)
    setDownloadProgress({ percent: 0, downloaded: 0, total: 0 })
    lastDownloadedRef.current = 0
    lastTimeRef.current = Date.now()
    
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setDownloadProgress({ percent: 0, downloaded: 0, total: event.data.contentLength || 0 })
        } else if (event.event === 'Progress') {
          setDownloadProgress(prev => {
            const downloaded = (prev?.downloaded || 0) + event.data.chunkLength
            const total = prev?.total || 0
            const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0
            
            const now = Date.now()
            const timeDiff = (now - lastTimeRef.current) / 1000
            if (timeDiff >= 0.5) {
              const bytesDiff = downloaded - lastDownloadedRef.current
              const speed = bytesDiff / timeDiff
              setDownloadSpeed(speed)
              lastDownloadedRef.current = downloaded
              lastTimeRef.current = now
            }
            
            return { percent, downloaded, total }
          })
        } else if (event.event === 'Finished') {
          setDownloadProgress(prev => ({ ...prev, percent: 100 }))
          setDownloadComplete(true)
          setInstalling(false)
        }
      })
    } catch (e) {
      console.error('Install update failed:', e)
      showError(t('update.failed'), t('update.installFailed') + ': ' + e)
      setInstalling(false)
      setDownloadProgress(null)
    }
  }

  const doRelaunch = async () => {
    try {
      await relaunch()
    } catch (e) {
      showError(t('update.failed'), e.toString())
    }
  }

  useEffect(() => {
    checkForUpdate()
  }, [])

  if (!updateInfo || dismissed) return null

  return (
    <div 
      className="fixed bottom-4 right-4 bg-[#1a1b2e] rounded-2xl shadow-2xl border border-[#2a2b4a] p-5 w-96 z-50"
      style={{ animation: 'slideInFromBottom 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)' }}
    >
      {/* 头部 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
            <Sparkles size={24} className="text-white" />
          </div>
          <div>
            <div className="font-semibold text-white text-base">{t('update.newVersionFound')}</div>
            <div className="text-sm text-gray-400">v{updateInfo.version}</div>
          </div>
        </div>
        {!installing && !downloadComplete && (
          <button 
            onClick={() => setDismissed(true)} 
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
          >
            <X size={18} className="text-gray-500" />
          </button>
        )}
      </div>
      
      {/* 下载完成状态 */}
      {downloadComplete ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={20} className="text-emerald-400" />
            <span className="text-emerald-400 font-medium">{t('update.downloadComplete')}</span>
          </div>
          <p className="text-sm text-gray-400">{t('update.restartToInstall')}</p>
          <div className="flex gap-3">
            <button
              onClick={() => setDismissed(true)}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-300 transition-colors"
            >
              {t('update.installLater')}
            </button>
            <button
              onClick={doRelaunch}
              className="flex-1 px-4 py-2.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all"
            >
              <RefreshCw size={16} />
              {t('update.restartNow')}
            </button>
          </div>
        </div>
      ) : installing && downloadProgress ? (
        /* 下载进度区域 */
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-300">{t('update.downloading')}...</span>
            <span className="text-sm font-mono text-indigo-400">{downloadProgress.percent}%</span>
          </div>
          
          <div className="h-2 bg-[#2a2b4a] rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${downloadProgress.percent}%` }}
            />
          </div>
          
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>{formatBytes(downloadProgress.downloaded)} / {formatBytes(downloadProgress.total)}</span>
            <span>{formatSpeed(downloadSpeed)}</span>
          </div>
          
          <div className="flex items-center gap-2 text-xs text-gray-500 pt-1">
            <RefreshCw size={12} className="animate-spin" />
            <span>{t('update.doNotClose')}</span>
          </div>
        </div>
      ) : (
        /* 初始状态 */
        <>
          {updateInfo.body && (
            <div className="text-sm text-gray-400 mb-4 max-h-24 overflow-y-auto leading-relaxed">
              {updateInfo.body}
            </div>
          )}
          
          <div className="flex gap-3">
            <button
              onClick={() => setDismissed(true)}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-sm text-gray-300 transition-colors"
            >
              {t('update.later')}
            </button>
            <button
              onClick={doUpdate}
              disabled={installing}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-600 hover:to-purple-600 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-indigo-500/25"
            >
              <Download size={16} />
              {t('update.updateNow')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export default UpdateChecker

// 动画样式
const style = document.createElement('style')
style.textContent = `
  @keyframes slideInFromBottom {
    from {
      opacity: 0;
      transform: translateY(30px) scale(0.95);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
`
if (!document.querySelector('#update-checker-styles')) {
  style.id = 'update-checker-styles'
  document.head.appendChild(style)
}
