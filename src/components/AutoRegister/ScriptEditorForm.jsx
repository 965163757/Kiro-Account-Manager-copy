import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { Code, Save, RotateCcw, FolderOpen, RefreshCw, Check, X, AlertTriangle } from 'lucide-react'

function ScriptEditorForm({ colors, isDark, t, showError, showSuccess, showConfirm }) {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [scriptPath, setScriptPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)

  // 加载脚本内容
  const loadScript = async () => {
    setLoading(true)
    try {
      const [scriptContent, path] = await Promise.all([
        invoke('get_script_content'),
        invoke('get_script_path_cmd')
      ])
      setContent(scriptContent)
      setOriginalContent(scriptContent)
      setScriptPath(path)
      setHasChanges(false)
    } catch (err) {
      console.error('Failed to load script:', err)
      showError(t('autoRegister.loadScriptFailed') || '加载脚本失败', err.toString())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadScript()
  }, [])

  // 检测内容变化
  useEffect(() => {
    setHasChanges(content !== originalContent)
  }, [content, originalContent])

  // 保存脚本
  const saveScript = async () => {
    setSaving(true)
    try {
      await invoke('save_script_content', { content })
      setOriginalContent(content)
      setHasChanges(false)
      showSuccess(t('autoRegister.saveScriptSuccess') || '保存成功', t('autoRegister.scriptSaved') || '脚本已保存')
    } catch (err) {
      showError(t('autoRegister.saveScriptFailed') || '保存失败', err.toString())
    } finally {
      setSaving(false)
    }
  }

  // 重置为默认脚本
  const resetScript = async () => {
    const confirmed = await showConfirm(
      t('autoRegister.resetScriptConfirm') || '确认重置',
      t('autoRegister.resetScriptConfirmDesc') || '确定要将脚本重置为默认内容吗？当前修改将丢失。'
    )
    
    if (confirmed) {
      try {
        const defaultContent = await invoke('reset_script_to_default')
        setContent(defaultContent)
        setOriginalContent(defaultContent)
        setHasChanges(false)
        showSuccess(t('autoRegister.resetScriptSuccess') || '重置成功', t('autoRegister.scriptReset') || '脚本已重置为默认内容')
      } catch (err) {
        showError(t('autoRegister.resetScriptFailed') || '重置失败', err.toString())
      }
    }
  }

  // 打开脚本所在文件夹
  const openFolder = async () => {
    try {
      await invoke('open_script_folder')
    } catch (err) {
      showError(t('autoRegister.openFolderFailed') || '打开文件夹失败', err.toString())
    }
  }

  // 放弃修改
  const discardChanges = () => {
    setContent(originalContent)
    setHasChanges(false)
  }

  if (loading) {
    return (
      <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="animate-spin text-blue-500" size={24} />
        </div>
      </section>
    )
  }

  return (
    <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Code size={18} className="text-purple-500" />
          <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.scriptEditor') || '脚本编辑器'}</h2>
          {hasChanges && (
            <span className="px-2 py-0.5 text-xs bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 rounded-full flex items-center gap-1">
              <AlertTriangle size={12} />
              {t('autoRegister.unsavedChanges') || '未保存'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openFolder}
            className={`p-2 rounded-lg transition-all ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            title={t('autoRegister.openScriptFolder') || '打开脚本文件夹'}
          >
            <FolderOpen size={16} className={colors.textMuted} />
          </button>
          <button
            onClick={resetScript}
            className={`p-2 rounded-lg transition-all ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            title={t('autoRegister.resetScript') || '重置为默认'}
          >
            <RotateCcw size={16} className={colors.textMuted} />
          </button>
        </div>
      </div>
      <p className={`text-sm ${colors.textMuted} mb-4`}>{t('autoRegister.scriptEditorDesc') || '编辑自动注册使用的 Python 脚本'}</p>

      {/* 脚本路径 */}
      <div className={`mb-4 p-3 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-50'}`}>
        <p className={`text-xs ${colors.textMuted}`}>{t('autoRegister.scriptPath') || '脚本路径'}</p>
        <p className={`text-sm ${colors.text} font-mono truncate`}>{scriptPath}</p>
      </div>

      {/* 代码编辑器 */}
      <div className="relative">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className={`w-full h-96 px-4 py-3 border rounded-xl font-mono text-sm resize-none ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          style={{ tabSize: 4 }}
          spellCheck={false}
        />
        
        {/* 行号提示 */}
        <div className={`absolute bottom-3 right-3 text-xs ${colors.textMuted}`}>
          {content.split('\n').length} {t('autoRegister.lines') || '行'}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={discardChanges}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 font-medium transition-all ${
                isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
              } ${colors.text}`}
            >
              <X size={16} />
              {t('autoRegister.discardChanges') || '放弃修改'}
            </button>
          )}
        </div>
        
        <button
          onClick={saveScript}
          disabled={saving || !hasChanges}
          className="px-4 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? (t('common.saving') || '保存中...') : (t('common.save') || '保存')}
        </button>
      </div>
    </section>
  )
}

export default ScriptEditorForm
