import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { Terminal, Search, RefreshCw, Check, X, FolderOpen } from 'lucide-react'

function PythonConfigForm({ config, onChange, colors, isDark, t }) {
  const [detecting, setDetecting] = useState(false)
  const [detectResult, setDetectResult] = useState(null)

  // 组件加载时自动检测
  useEffect(() => {
    if (config.autoDetect && !config.detectedPath) {
      detectPython()
    }
  }, [])

  const detectPython = async () => {
    setDetecting(true)
    setDetectResult(null)
    try {
      const customPath = config.autoDetect ? null : config.pythonPath
      const result = await invoke('detect_python_env', { customPath })
      
      onChange({ 
        detectedPath: result.path,
        detectedVersion: result.version || ''
      })
      setDetectResult({ 
        success: true, 
        message: `${result.version || 'Python'} - ${result.path}` 
      })
    } catch (err) {
      setDetectResult({ success: false, message: err.toString() })
      onChange({ detectedPath: '', detectedVersion: '' })
    } finally {
      setDetecting(false)
    }
  }

  // 选择 Python 文件
  const selectPythonPath = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{
          name: 'Python',
          extensions: ['exe', '']
        }]
      })
      
      if (selected) {
        onChange({ pythonPath: selected })
        // 自动验证选择的路径
        setDetecting(true)
        setDetectResult(null)
        try {
          const result = await invoke('detect_python_env', { customPath: selected })
          onChange({ 
            pythonPath: selected,
            detectedPath: result.path,
            detectedVersion: result.version || ''
          })
          setDetectResult({ 
            success: true, 
            message: `${result.version || 'Python'} - ${result.path}` 
          })
        } catch (err) {
          setDetectResult({ success: false, message: err.toString() })
        } finally {
          setDetecting(false)
        }
      }
    } catch (err) {
      console.error('Failed to open file dialog:', err)
    }
  }

  return (
    <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
      <div className="flex items-center gap-2 mb-1">
        <Terminal size={18} className="text-yellow-500" />
        <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.pythonConfig') || 'Python 环境'}</h2>
      </div>
      <p className={`text-sm ${colors.textMuted} mb-5`}>{t('autoRegister.pythonConfigDesc') || '配置用于执行自动注册脚本的 Python 环境'}</p>

      {/* 自动检测开关 */}
      <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all mb-4`}>
        <input
          type="checkbox"
          checked={config.autoDetect}
          onChange={(e) => onChange({ autoDetect: e.target.checked })}
          className="w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
        />
        <Search size={16} className={colors.textMuted} />
        <div>
          <span className={`text-sm font-medium ${colors.text}`}>{t('autoRegister.autoDetectPython') || '自动检测 Python'}</span>
          <p className={`text-xs ${colors.textMuted}`}>{t('autoRegister.autoDetectPythonDesc') || '自动查找系统中安装的 Python'}</p>
        </div>
      </label>

      {/* 手动指定路径 */}
      {!config.autoDetect && (
        <div className="mb-4">
          <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.pythonPath') || 'Python 路径'}</label>
          <div className="flex gap-3">
            <input
              type="text"
              value={config.pythonPath || ''}
              onChange={(e) => onChange({ pythonPath: e.target.value })}
              placeholder={t('autoRegister.pythonPathPlaceholder') || '例如: C:\\Python313\\python.exe 或 /usr/bin/python3'}
              className={`flex-1 px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
            />
            <button
              onClick={selectPythonPath}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all ${
                isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
              } ${colors.text}`}
              title={t('autoRegister.browsePython') || '浏览...'}
            >
              <FolderOpen size={16} />
            </button>
          </div>
        </div>
      )}

      {/* 检测按钮和结果 */}
      <div className="flex items-center gap-4">
        <button
          onClick={detectPython}
          disabled={detecting}
          className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all disabled:opacity-50 ${
            isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
          } ${colors.text}`}
        >
          {detecting ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />}
          {detecting ? (t('autoRegister.detecting') || '检测中...') : (t('autoRegister.detectPython') || '检测 Python')}
        </button>

        {detectResult && (
          <div className={`flex items-center gap-2 text-sm ${detectResult.success ? 'text-green-500' : 'text-red-500'}`}>
            {detectResult.success ? <Check size={16} /> : <X size={16} />}
            <span className="truncate max-w-xs">{detectResult.message}</span>
          </div>
        )}
      </div>

      {/* 已检测到的 Python 信息 */}
      {config.detectedPath && (
        <div className={`mt-4 p-3 rounded-xl ${isDark ? 'bg-green-500/10' : 'bg-green-50'} border ${isDark ? 'border-green-500/20' : 'border-green-200'}`}>
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
            <Check size={16} />
            <span className="font-medium">{config.detectedVersion || 'Python'}</span>
          </div>
          <p className={`text-xs mt-1 ${colors.textMuted} truncate`}>{config.detectedPath}</p>
        </div>
      )}
    </section>
  )
}

export default PythonConfigForm
