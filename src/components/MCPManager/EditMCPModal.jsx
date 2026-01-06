import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n'

function EditMCPModal({ name, config, onClose, onSuccess }) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'

  const [command, setCommand] = useState(config.command || '')
  const [args, setArgs] = useState((config.args || []).join(' '))
  const [envList, setEnvList] = useState(
    Object.entries(config.env || {}).map(([key, value]) => ({ key, value }))
  )
  const [autoApprove, setAutoApprove] = useState((config.autoApprove || []).join('\n'))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 添加环境变量
  const addEnv = () => setEnvList([...envList, { key: '', value: '' }])
  const removeEnv = (index) => setEnvList(envList.filter((_, i) => i !== index))
  const updateEnv = (index, field, value) => {
    setEnvList(envList.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  // 保存
  const handleSave = async () => {
    if (!command.trim()) {
      setError(t('mcpManager.errorNoCommand'))
      return
    }

    setSaving(true)
    setError('')

    try {
      const newConfig = {
        command: command.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        env: envList.reduce((acc, { key, value }) => {
          if (key.trim()) acc[key.trim()] = value
          return acc
        }, {}),
        disabled: config.disabled || false,
        autoApprove: autoApprove.trim() ? autoApprove.trim().split('\n').map(s => s.trim()).filter(Boolean) : []
      }

      await invoke('save_mcp_server', { name, config: newConfig })
      onSuccess()
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className={`${colors.card} rounded-2xl shadow-2xl w-[500px] max-h-[80vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${colors.cardBorder}`}>
          <h2 className={`text-lg font-semibold ${colors.text}`}>{t('common.edit')}: {name}</h2>
          <button onClick={onClose} className={`p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <X size={20} className={colors.textMuted} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* 启动命令 */}
          <div>
            <label className={`block text-sm font-medium ${colors.text} mb-1`}>{t('mcpManager.command')}</label>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} focus:outline-none focus:ring-2 focus:ring-purple-500/30`}
            />
          </div>

          {/* 参数 */}
          <div>
            <label className={`block text-sm font-medium ${colors.text} mb-1`}>{t('mcpManager.args')}</label>
            <input
              type="text"
              value={args}
              onChange={e => setArgs(e.target.value)}
              className={`w-full px-3 py-2 rounded-lg border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} focus:outline-none focus:ring-2 focus:ring-purple-500/30`}
            />
          </div>

          {/* 环境变量 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`text-sm font-medium ${colors.text}`}>{t('mcpManager.envVars')}</label>
              <button onClick={addEnv} className={`text-sm ${isDark ? 'text-purple-400' : 'text-purple-600'} flex items-center gap-1`}>
                <Plus size={14} />{t('common.add')}
              </button>
            </div>
            {envList.map((env, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={env.key}
                  onChange={e => updateEnv(i, 'key', e.target.value)}
                  placeholder="KEY"
                  className={`flex-1 px-3 py-2 rounded-lg border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30`}
                />
                <span className={colors.textMuted}>=</span>
                <input
                  type="text"
                  value={env.value}
                  onChange={e => updateEnv(i, 'value', e.target.value)}
                  placeholder="value"
                  className={`flex-1 px-3 py-2 rounded-lg border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30`}
                />
                <button onClick={() => removeEnv(i)} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg">
                  <Minus size={16} />
                </button>
              </div>
            ))}
          </div>

          {/* 自动批准工具 */}
          <div>
            <label className={`block text-sm font-medium ${colors.text} mb-1`}>{t('mcpManager.autoApproveTools')}</label>
            <textarea
              value={autoApprove}
              onChange={e => setAutoApprove(e.target.value)}
              rows={3}
              placeholder="tool_name_1&#10;tool_name_2"
              className={`w-full px-3 py-2 rounded-lg border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/30 resize-none`}
            />
          </div>

          {error && <div className="text-red-500 text-sm">{error}</div>}
        </div>

        {/* 底部按钮 */}
        <div className={`flex justify-end gap-3 px-6 py-4 border-t ${colors.cardBorder}`}>
          <button onClick={onClose} className={`px-4 py-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${colors.text}`}>
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-700 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default EditMCPModal
