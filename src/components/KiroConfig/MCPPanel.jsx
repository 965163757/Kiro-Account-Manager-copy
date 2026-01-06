import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import { useI18n } from '../../i18n.jsx'
import { Server, Plus, Edit2, Trash2, Terminal } from 'lucide-react'
import AddMCPModal from '../MCPManager/AddMCPModal'
import EditMCPModal from '../MCPManager/EditMCPModal'

function MCPPanel() {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const { showConfirm } = useDialog()
  const [servers, setServers] = useState({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingServer, setEditingServer] = useState(null)

  const loadConfig = useCallback(async () => {
    try {
      const config = await invoke('get_mcp_config')
      setServers(config.mcpServers || {})
    } catch (e) {
      console.error('加载 MCP 配置失败:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  const handleToggle = async (name, disabled) => {
    try {
      await invoke('toggle_mcp_server', { name, disabled })
      setServers(prev => ({ ...prev, [name]: { ...prev[name], disabled } }))
    } catch (e) {
      console.error('切换状态失败:', e)
    }
  }

  const handleDelete = async (name) => {
    const confirmed = await showConfirm(t('mcp.confirmDelete'), `${t('common.confirm')} ${name}?`)
    if (confirmed) {
      try {
        await invoke('delete_mcp_server', { name })
        setServers(prev => {
          const next = { ...prev }
          delete next[name]
          return next
        })
      } catch (e) {
        console.error('删除失败:', e)
      }
    }
  }

  const serverList = Object.entries(servers)

  return (
    <div className="h-full flex flex-col">
      {/* 工具栏 */}
      <div className={`px-6 py-3 border-b ${colors.cardBorder} flex items-center justify-between`}>
        <span className={`text-sm ${colors.textMuted}`}>{serverList.length} {t('mcp.title')}</span>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-3 py-1.5 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-lg text-sm font-medium hover:from-purple-600 hover:to-pink-700 flex items-center gap-1.5"
        >
          <Plus size={14} />{t('mcp.add')}
        </button>
      </div>

      {/* 列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className={`text-center py-12 ${colors.textMuted}`}>{t('common.loading')}</div>
        ) : serverList.length === 0 ? (
          <div className="text-center py-12">
            <Server size={48} className={`mx-auto mb-4 ${colors.textMuted} opacity-50`} />
            <p className={colors.textMuted}>{t('mcp.noServers')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {serverList.map(([name, config]) => (
              <MCPServerItem
                key={name}
                name={name}
                config={config}
                isDark={isDark}
                colors={colors}
                t={t}
                onToggle={(disabled) => handleToggle(name, disabled)}
                onEdit={() => setEditingServer({ name, config })}
                onDelete={() => handleDelete(name)}
              />
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddMCPModal onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); loadConfig() }} />
      )}
      {editingServer && (
        <EditMCPModal
          name={editingServer.name}
          config={editingServer.config}
          onClose={() => setEditingServer(null)}
          onSuccess={() => { setEditingServer(null); loadConfig() }}
        />
      )}
    </div>
  )
}

function MCPServerItem({ name, config, isDark, colors, onToggle, onEdit, onDelete, t }) {
  const isDisabled = config.disabled
  const commandStr = [config.command, ...(config.args || [])].join(' ')

  return (
    <div className={`${colors.card} border ${colors.cardBorder} rounded-xl p-4 flex items-center gap-4`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
        isDisabled ? (isDark ? 'bg-gray-500/20' : 'bg-gray-100') : (isDark ? 'bg-green-500/20' : 'bg-green-50')
      }`}>
        <Server size={20} className={isDisabled ? 'text-gray-400' : 'text-green-500'} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`font-semibold ${colors.text} ${isDisabled ? 'opacity-50' : ''}`}>{name}</h3>
          {isDisabled && (
            <span className={`text-xs px-2 py-0.5 rounded ${isDark ? 'bg-gray-500/30 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>{t('mcp.disabled')}</span>
          )}
        </div>
        <div className={`flex items-center gap-1.5 text-sm ${colors.textMuted} ${isDisabled ? 'opacity-50' : ''}`}>
          <Terminal size={12} />
          <code className="truncate">{commandStr}</code>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onToggle(!isDisabled)}
          className={`relative w-10 h-5 rounded-full transition-colors ${isDisabled ? (isDark ? 'bg-gray-600' : 'bg-gray-300') : 'bg-green-500'}`}
        >
          <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${isDisabled ? 'left-0.5' : 'left-5'}`} />
        </button>
        <button onClick={onEdit} className={`p-2 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
          <Edit2 size={16} className={colors.textMuted} />
        </button>
        <button onClick={onDelete} className="p-2 rounded-lg hover:bg-red-500/10">
          <Trash2 size={16} className="text-red-500" />
        </button>
      </div>
    </div>
  )
}

export default MCPPanel
