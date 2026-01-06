import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useDialog } from '../../contexts/DialogContext'
import { FileText, RefreshCw, Trash2, Save, Plus, X } from 'lucide-react'

function SteeringPanel() {
  const { theme, colors } = useTheme()
  const { showConfirm, showError } = useDialog()
  const isDark = theme === 'dark'
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFile, setSelectedFile] = useState(null)
  const [editContent, setEditContent] = useState('')
  const [editInclusion, setEditInclusion] = useState('always')
  const [editFilePattern, setEditFilePattern] = useState('')
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newFileName, setNewFileName] = useState('')
  const [newInclusion, setNewInclusion] = useState('always')
  const [newFilePattern, setNewFilePattern] = useState('')

  const loadFiles = async () => {
    setLoading(true)
    try {
      const data = await invoke('get_steering_files')
      setFiles(data)
    } catch (e) {
      console.error('加载 Steering 文件失败:', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadFiles()
  }, [])

  const handleSelect = async (file) => {
    if (hasChanges) {
      const confirmed = await showConfirm('未保存的更改', '有未保存的更改，确定切换？')
      if (!confirmed) return
    }
    setSelectedFile(file)
    const parsed = parseFrontMatter(file.content)
    setEditInclusion(parsed.inclusion)
    setEditFilePattern(parsed.filePattern)
    setEditContent(parsed.body)
    setHasChanges(false)
  }

  const handleContentChange = (e) => {
    setEditContent(e.target.value)
    checkChanges(editInclusion, editFilePattern, e.target.value)
  }

  const handleInclusionChange = (value) => {
    setEditInclusion(value)
    checkChanges(value, editFilePattern, editContent)
  }

  const handleFilePatternChange = (value) => {
    setEditFilePattern(value)
    checkChanges(editInclusion, value, editContent)
  }

  const checkChanges = (inclusion, pattern, body) => {
    if (!selectedFile) return
    const newContent = buildContent(inclusion, pattern, body)
    setHasChanges(newContent !== selectedFile.content)
  }

  const handleSave = async () => {
    if (!selectedFile) return
    setSaving(true)
    try {
      const fullContent = buildContent(editInclusion, editFilePattern, editContent)
      await invoke('save_steering_file', { fileName: selectedFile.fileName, content: fullContent })
      setFiles(files.map(f => f.fileName === selectedFile.fileName ? { ...f, content: fullContent } : f))
      setSelectedFile({ ...selectedFile, content: fullContent })
      setHasChanges(false)
    } catch (e) {
      console.error('保存失败:', e)
      showError('保存失败', String(e))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (fileName) => {
    const confirmed = await showConfirm('确认删除', `确定删除 "${fileName}"？`)
    if (!confirmed) return
    try {
      await invoke('delete_steering_file', { fileName })
      setFiles(files.filter(f => f.fileName !== fileName))
      if (selectedFile?.fileName === fileName) {
        setSelectedFile(null)
        setEditContent('')
        setHasChanges(false)
      }
    } catch (e) {
      console.error('删除失败:', e)
    }
  }

  const openCreateModal = () => {
    setNewFileName('')
    setNewInclusion('always')
    setNewFilePattern('')
    setShowCreateModal(true)
  }

  const handleCreate = async () => {
    if (!newFileName.trim()) return
    const fileName = newFileName.endsWith('.md') ? newFileName : `${newFileName}.md`
    
    let frontMatter = `---\ninclusion: ${newInclusion}`
    if (newInclusion === 'fileMatch' && newFilePattern.trim()) {
      frontMatter += `\nfileMatchPattern: '${newFilePattern.trim()}'`
    }
    frontMatter += '\n---\n\n<!-- 在此添加你的 steering 规则 -->\n'
    
    try {
      const newFile = await invoke('create_steering_file', { fileName, content: frontMatter })
      setFiles([...files, newFile])
      setShowCreateModal(false)
      handleSelect(newFile)
    } catch (e) {
      showError('创建失败', String(e))
    }
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    return `${(bytes / 1024).toFixed(1)} KB`
  }

  // 解析 front-matter
  const parseFrontMatter = (content) => {
    const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
    if (!match) return { inclusion: 'always', filePattern: '', body: content }
    
    const frontMatter = match[1]
    const body = match[2]
    
    const inclusionMatch = frontMatter.match(/inclusion:\s*(\w+)/)
    const patternMatch = frontMatter.match(/fileMatchPattern:\s*['"]?([^'"\n]+)['"]?/)
    
    return {
      inclusion: inclusionMatch ? inclusionMatch[1] : 'always',
      filePattern: patternMatch ? patternMatch[1] : '',
      body: body
    }
  }

  // 组装 front-matter
  const buildContent = (inclusion, filePattern, body) => {
    let frontMatter = `---\ninclusion: ${inclusion}`
    if (inclusion === 'fileMatch' && filePattern.trim()) {
      frontMatter += `\nfileMatchPattern: '${filePattern.trim()}'`
    }
    frontMatter += '\n---\n'
    return frontMatter + body
  }

  const inclusionOptions = [
    { value: 'always', label: '始终包含', desc: '每次对话都会加载' },
    { value: 'fileMatch', label: '文件匹配', desc: '当匹配的文件被读取时加载' },
    { value: 'manual', label: '手动引用', desc: '通过 # 手动引用时加载' },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="animate-spin text-blue-500" size={24} />
      </div>
    )
  }

  return (
    <div className="h-full flex">
      {/* 左侧列表 */}
      <div className={`w-64 border-r ${colors.cardBorder} flex flex-col`}>
        <div className={`p-4 border-b ${colors.cardBorder} flex items-center justify-between`}>
          <span className={`text-sm font-medium ${colors.text}`}>Steering ({files.length})</span>
          <div className="flex gap-1">
            <button onClick={openCreateModal} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
              <Plus size={16} className={colors.textMuted} />
            </button>
            <button onClick={loadFiles} className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}>
              <RefreshCw size={16} className={colors.textMuted} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-2 space-y-1">
          {files.length === 0 ? (
            <div className={`text-center py-8 ${colors.textMuted}`}>
              <FileText size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">暂无 Steering 文件</p>
            </div>
          ) : (
            files.map(file => (
              <div
                key={file.fileName}
                onClick={() => handleSelect(file)}
                className={`p-3 rounded-xl cursor-pointer transition-all group ${
                  selectedFile?.fileName === file.fileName
                    ? (isDark ? 'bg-white/10' : 'bg-blue-50')
                    : (isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50')
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-medium text-sm ${colors.text} truncate`}>{file.fileName}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(file.fileName) }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-red-500 hover:bg-red-500/10"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className={`text-xs ${colors.textMuted} mt-1`}>
                  {formatSize(file.size)} · {file.modifiedAt || '未知时间'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右侧编辑器 */}
      <div className="flex-1 flex flex-col">
        {selectedFile ? (
          <>
            <div className={`p-4 border-b ${colors.cardBorder} flex items-center justify-between`}>
              <div className="flex items-center gap-2">
                <h3 className={`font-semibold ${colors.text}`}>{selectedFile.fileName}</h3>
                {hasChanges && <span className="text-xs text-orange-500">● 未保存</span>}
              </div>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  hasChanges
                    ? 'bg-blue-500 text-white hover:bg-blue-600'
                    : (isDark ? 'bg-white/5 text-gray-500' : 'bg-gray-100 text-gray-400')
                } disabled:opacity-50`}
              >
                <Save size={14} />
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
            {/* 配置区域 */}
            <div className={`px-4 py-3 border-b ${colors.cardBorder} flex items-center gap-4`}>
              <div className="flex items-center gap-2">
                <span className={`text-xs ${colors.textMuted}`}>包含模式:</span>
                <select
                  value={editInclusion}
                  onChange={(e) => handleInclusionChange(e.target.value)}
                  className={`px-2 py-1 border rounded-lg text-xs ${colors.text} ${colors.input} focus:outline-none focus:ring-1 focus:ring-blue-500/30`}
                >
                  {inclusionOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {editInclusion === 'fileMatch' && (
                <div className="flex items-center gap-2">
                  <span className={`text-xs ${colors.textMuted}`}>匹配模式:</span>
                  <input
                    type="text"
                    value={editFilePattern}
                    onChange={(e) => handleFilePatternChange(e.target.value)}
                    placeholder="**/*.jsx"
                    className={`px-2 py-1 border rounded-lg text-xs w-32 ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-1 focus:ring-blue-500/30`}
                  />
                </div>
              )}
            </div>
            {/* 编辑区域 */}
            <div className="flex-1 p-4">
              <textarea
                value={editContent}
                onChange={handleContentChange}
                className={`w-full h-full p-4 rounded-xl border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
                placeholder="输入 Markdown 内容..."
              />
            </div>
          </>
        ) : (
          <div className={`flex-1 flex items-center justify-center ${colors.textMuted}`}>
            <div className="text-center">
              <FileText size={48} className="mx-auto mb-2 opacity-30" />
              <p>选择一个文件进行编辑</p>
            </div>
          </div>
        )}
      </div>

      {/* 创建弹窗 */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowCreateModal(false)}>
          <div 
            className={`${colors.card} rounded-2xl w-full max-w-[380px] shadow-2xl border ${colors.cardBorder} overflow-hidden`}
            onClick={e => e.stopPropagation()}
            style={{ animation: 'dialogIn 0.2s ease-out' }}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-5 py-4 ${isDark ? 'bg-white/[0.02]' : 'bg-gray-50/50'}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'} flex items-center justify-center`}>
                  <FileText size={20} className="text-blue-500" />
                </div>
                <h2 className={`text-base font-semibold ${colors.text}`}>新建 Steering</h2>
              </div>
              <button onClick={() => setShowCreateModal(false)} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
                <X size={18} className={colors.textMuted} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 文件名 */}
              <div>
                <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>文件名</label>
                <input
                  type="text"
                  placeholder="例如: my-rules"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all`}
                />
                <p className={`text-xs ${colors.textMuted} mt-1`}>自动添加 .md 后缀</p>
              </div>

              {/* Inclusion 模式 */}
              <div>
                <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>包含模式</label>
                <select
                  value={newInclusion}
                  onChange={(e) => setNewInclusion(e.target.value)}
                  className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
                >
                  {inclusionOptions.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label} - {opt.desc}</option>
                  ))}
                </select>
              </div>

              {/* fileMatch 模式的 pattern 输入 */}
              {newInclusion === 'fileMatch' && (
                <div>
                  <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>匹配模式</label>
                  <input
                    type="text"
                    placeholder="例如: **/*.jsx"
                    value={newFilePattern}
                    onChange={(e) => setNewFilePattern(e.target.value)}
                    className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all`}
                  />
                </div>
              )}

              {/* 创建按钮 */}
              <button
                onClick={handleCreate}
                disabled={!newFileName.trim()}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                创建
              </button>
            </div>
          </div>

          <style>{`
            @keyframes dialogIn {
              from { opacity: 0; transform: scale(0.95) translateY(-10px); }
              to { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}

export default SteeringPanel
