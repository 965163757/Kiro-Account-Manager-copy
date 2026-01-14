import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { save } from '@tauri-apps/plugin-dialog'
import { History, Download, Trash2, RefreshCw, CheckCircle, XCircle, Copy, Check } from 'lucide-react'

function HistoryPanel({ history, onRefresh, colors, isDark, t, showError, showSuccess, showConfirm }) {
  const [exporting, setExporting] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [copiedId, setCopiedId] = useState(null)

  const exportHistory = async () => {
    try {
      const path = await save({
        defaultPath: `kiro-registrations-${new Date().toISOString().split('T')[0]}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (!path) return

      setExporting(true)
      await invoke('export_registration_history', { path })
      await showSuccess(t('autoRegister.exportSuccess'), t('autoRegister.exportSuccessDesc'))
    } catch (err) {
      await showError(t('autoRegister.exportFailed'), err.toString())
    } finally {
      setExporting(false)
    }
  }

  const clearHistory = async () => {
    const confirmed = await showConfirm(
      t('autoRegister.clearHistory'),
      t('autoRegister.clearHistoryConfirm')
    )
    if (!confirmed) return

    setClearing(true)
    try {
      await invoke('clear_registration_history')
      onRefresh()
      await showSuccess(t('autoRegister.clearSuccess'), t('autoRegister.clearSuccessDesc'))
    } catch (err) {
      await showError(t('autoRegister.clearFailed'), err.toString())
    } finally {
      setClearing(false)
    }
  }

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleString()
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* 操作栏 */}
      <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History size={18} className="text-indigo-500" />
            <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.registrationHistory')}</h2>
            <span className={`text-sm ${colors.textMuted}`}>({history.length} {t('autoRegister.records')})</span>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onRefresh}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all ${
                isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
              } ${colors.text}`}
            >
              <RefreshCw size={16} />
              {t('common.refresh')}
            </button>

            <button
              onClick={exportHistory}
              disabled={exporting || history.length === 0}
              className={`px-4 py-2 rounded-xl flex items-center gap-2 transition-all disabled:opacity-50 ${
                isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-200 hover:bg-gray-300'
              } ${colors.text}`}
            >
              {exporting ? <RefreshCw size={16} className="animate-spin" /> : <Download size={16} />}
              {t('autoRegister.export')}
            </button>

            <button
              onClick={clearHistory}
              disabled={clearing || history.length === 0}
              className="px-4 py-2 rounded-xl flex items-center gap-2 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-all disabled:opacity-50"
            >
              {clearing ? <RefreshCw size={16} className="animate-spin" /> : <Trash2 size={16} />}
              {t('autoRegister.clear')}
            </button>
          </div>
        </div>
      </section>

      {/* 历史记录列表 */}
      <section className={`card-glow ${colors.card} rounded-2xl shadow-sm border ${colors.cardBorder} overflow-hidden`}>
        {history.length === 0 ? (
          <div className="p-12 text-center">
            <History size={48} className={`mx-auto mb-4 ${colors.textMuted}`} />
            <p className={colors.textMuted}>{t('autoRegister.noHistory')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {history.map((record) => (
              <div 
                key={record.id} 
                className={`p-4 ${isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} transition-colors`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    {record.status === 'success' ? (
                      <CheckCircle size={20} className="text-green-500 mt-0.5" />
                    ) : (
                      <XCircle size={20} className="text-red-500 mt-0.5" />
                    )}
                    <div>
                      <div className={`font-medium ${colors.text}`}>{record.email}</div>
                      <div className={`text-sm ${colors.textMuted} mt-1`}>
                        {formatDate(record.timestamp)}
                      </div>
                      {record.error && (
                        <div className="text-sm text-red-500 mt-1">{record.error}</div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {record.status === 'success' && record.password && (
                      <button
                        onClick={() => copyToClipboard(`${record.email}:${record.password}`, record.id)}
                        className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition-all ${
                          isDark ? 'bg-white/10 hover:bg-white/20' : 'bg-gray-100 hover:bg-gray-200'
                        } ${colors.text}`}
                        title={t('autoRegister.copyCredentials')}
                      >
                        {copiedId === record.id ? (
                          <>
                            <Check size={14} className="text-green-500" />
                            {t('common.copied')}
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            {t('common.copy')}
                          </>
                        )}
                      </button>
                    )}
                    <span className={`px-2 py-1 rounded-lg text-xs font-medium ${
                      record.status === 'success' 
                        ? 'bg-green-500/10 text-green-500' 
                        : 'bg-red-500/10 text-red-500'
                    }`}>
                      {record.status === 'success' ? t('autoRegister.success') : t('autoRegister.failed')}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

export default HistoryPanel
