import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import { useI18n } from '../../i18n'
import { Server, Plus, Sparkles } from 'lucide-react'
import MCPServerCard from './MCPServerCard'
import AddMCPModal from './AddMCPModal'
import EditMCPModal from './EditMCPModal'

function MCPManager() {
  const { colors } = useTheme()
  const { showConfirm } = useDialog()
  const { t } = useI18n()
  const [servers, setServers] = useState({})
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingServer, setEditingServer] = useState(null) // { name, config }

  // 加载配置
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

  // 切换启用/禁用
  const handleToggle = async (name, disabled) => {
    try {
      await invoke('toggle_mcp_server', { name, disabled })
      setServers(prev => ({
        ...prev,
        [name]: { ...prev[name], disabled }
      }))
    } catch (e) {
      console.error('切换状态失败:', e)
    }
  }

  // 删除服务器
  const handleDelete = async (name) => {
    const confirmed = await showConfirm(t('mcpManager.deleteServer'), `${t('mcpManager.confirmDelete')} ${name}？`)
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
    <div className={`h-full flex flex-col ${colors.main}`}>
      {/* 头部 */}
      <div className={`${colors.card} border-b ${colors.cardBorder} px-6 py-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/20">
              <Sparkles size={20} className="text-white" />
            </div>
            <div>
              <h1 className={`text-xl font-bold ${colors.text}`}>{t('mcpManager.title')}</h1>
              <p className={`text-sm ${colors.textMuted}`}>{t('mcpManager.subtitle')}</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-purple-500 to-pink-600 text-white rounded-xl text-sm font-medium hover:from-purple-600 hover:to-pink-700 flex items-center gap-1.5 shadow-lg shadow-purple-500/25"
          >
            <Plus size={16} />{t('mcpManager.addServer')}
          </button>
        </div>
      </div>


      {/* 列表 */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className={`text-center py-12 ${colors.textMuted}`}>{t('common.loading')}</div>
        ) : serverList.length === 0 ? (
          <div className="text-center py-12">
            <Server size={48} className={`mx-auto mb-4 ${colors.textMuted} opacity-50`} />
            <p className={colors.textMuted}>{t('mcpManager.noServers')}</p>
            <p className={`text-sm ${colors.textMuted} mt-1`}>{t('mcpManager.addFirst')}</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {serverList.map(([name, config]) => (
              <MCPServerCard
                key={name}
                name={name}
                config={config}
                onToggle={(disabled) => handleToggle(name, disabled)}
                onEdit={() => setEditingServer({ name, config })}
                onDelete={() => handleDelete(name)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 添加弹窗 */}
      {showAddModal && (
        <AddMCPModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); loadConfig() }}
        />
      )}

      {/* 编辑弹窗 */}
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

export default MCPManager
