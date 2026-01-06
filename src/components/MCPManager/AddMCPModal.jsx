import { useState } from 'react'
import { X, Plus, Minus } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n'
import { MCP_TEMPLATES } from './MCPTemplates'

function AddMCPModal({ onClose, onSuccess }) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'

  const [name, setName] = useState('')
  const [command, setCommand] = useState('uvx')
  const [args, setArgs] = useState('')
  const [envList, setEnvList] = useState([]) // [{ key, value }]
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // 从模板填充
  const applyTemplate = (template) => {
    setName(template.name)
    setCommand(template.config.command)
    setArgs(template.config.args.join(' '))
    setEnvList(Object.entries(template.config.env).map(([key, value]) => ({ key, value })))
    setError('')
  }

  // 添加环境变量
  const addEnv = () => {
    setEnvList([...envList, { key: '', value: '' }])
  }

  // 删除环境变量
  const removeEnv = (index) => {
    setEnvList(envList.filter((_, i) => i !== index))
  }

  // 更新环境变量
  const updateEnv = (index, field, value) => {
    setEnvList(envList.map((item, i) => i === index ? { ...item, [field]: value } : item))
  }

  // 保存
  const handleSave = async () => {
    if (!name.trim()) {
      setError(t('mcpManager.errorNoName'))
      return
    }
    if (!command.trim()) {
      setError(t('mcpManager.errorNoCommand'))
      return
    }

    setSaving(true)
    setError('')

    try {
      const config = {
        command: command.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        env: envList.reduce((acc, { key, value }) => {
          if (key.trim()) acc[key.trim()] = value
          return acc
        }, {}),
        disabled: false,
        autoApprove: []
      }

      await invoke('save_mcp_server', { name: name.trim(), config })
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
          <h2 className={`text-lg font-semibold ${colors.text}`}>{t('mcpManager.addMCPServer')}</h2>
          <button onClick={onClose} className={`p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
            <X size={20} className={colors.textMuted} />
          </button>
        </div>

        {/* 内容 */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* 快速添加模板 */}
          <div>
            <label className={`block text-sm font-medium ${colors.text} mb-2`}>{t('mcpManager.quickAdd')}</label>
            <div className="flex flex-wrap gap-2">
              {MCP_TEMPLATES.map(t => (
                <button
                  key={t.name}
                  onClick={() => applyTemplate(t)}
                  className={`px-3 py-1.5 text-sm rounded-lg border ${colors.cardBorder} ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-50'} transition-colors`}
                  title={t.description}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`border-t ${colors.cardBorder} my-4`} />


          {/* 服务器名称 */}
          <div>
            <label className={`block text-sm font-medium ${colors.text} mb-1`}>{t('mcpManager.serverName')}</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder={t('mcpManager.serverNamePlaceholder')}
              className={`w-full px-3 py-2 rounded-lg border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} focus:outline-none focus:ring-2 focus:ring-purple-500/30`}
            />
          </div>

          {/* 启动命令 */}
          <div>
            <label className={`block text-sm font-medium ${colors.text} mb-1`}>{t('mcpManager.command')}</label>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              placeholder={t('mcpManager.commandPlaceholder')}
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
              placeholder={t('mcpManager.argsPlaceholder')}
              className={`w-full px-3 py-2 rounded-lg border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} focus:outline-none focus:ring-2 focus:ring-purple-500/30`}
            />
          </div>

          {/* 环境变量 */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={`text-sm font-medium ${colors.text}`}>{t('mcpManager.envVars')}</label>
              <button
                onClick={addEnv}
                className={`text-sm ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-700'} flex items-center gap-1`}
              >
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

          {/* 错误提示 */}
          {error && (
            <div className="text-red-500 text-sm">{error}</div>
          )}
        </div>

        {/* 底部按钮 */}
        <div className={`flex justify-end gap-3 px-6 py-4 border-t ${colors.cardBorder}`}>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${colors.text}`}
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-pink-700 disabled:opacity-50"
          >
            {saving ? t('common.saving') : t('common.add')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default AddMCPModal
