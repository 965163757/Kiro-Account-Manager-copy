import { useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { X, Download, Key, Shield, ChevronDown } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n.jsx'

function AddAccountModal({ onClose, onSuccess }) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')
  const [addType, setAddType] = useState('social')
  const [refreshToken, setRefreshToken] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [region, setRegion] = useState('us-east-1')

  const awsRegions = [
    { value: 'us-east-1', label: 'us-east-1 (N. Virginia)' },
    { value: 'us-west-2', label: 'us-west-2 (Oregon)' },
    { value: 'eu-west-1', label: 'eu-west-1 (Ireland)' },
  ]

  const handleSaveLocal = async () => {
    setAddLoading(true)
    setAddError('')
    try {
      await invoke('add_local_kiro_account')
      onSuccess()
      onClose()
    } catch (e) {
      setAddError(e.toString())
    } finally {
      setAddLoading(false)
    }
  }

  const handleAddManual = async () => {
    if (!refreshToken) {
      setAddError(t('addAccount.errorNoToken'))
      return
    }
    
    // 校验 token 格式（所有 refreshToken 都以 aor 开头）
    if (!refreshToken.startsWith('aor')) {
      setAddError(addType === 'social' ? t('addAccount.errorSocialFormat') : t('addAccount.errorIdcFormat'))
      return
    }
    
    setAddLoading(true)
    setAddError('')
    try {
      if (addType === 'idc') {
        if (!clientId || !clientSecret) {
          setAddError(t('addAccount.errorNoClientId'))
          setAddLoading(false)
          return
        }
        await invoke('add_account_by_idc', { refreshToken, clientId, clientSecret, region })
      } else {
        await invoke('add_account_by_social', { refreshToken })
      }
      onSuccess()
      onClose()
    } catch (e) {
      setAddError(e.toString())
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className={`${colors.card} rounded-2xl w-full max-w-[420px] shadow-2xl border ${colors.cardBorder} overflow-hidden`} 
        onClick={e => e.stopPropagation()}
        style={{ animation: 'dialogIn 0.2s ease-out' }}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 ${isDark ? 'bg-white/[0.02]' : 'bg-gray-50/50'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-blue-500/15' : 'bg-blue-50'} flex items-center justify-center`}>
              <Key size={20} className="text-blue-500" />
            </div>
            <h2 className={`text-base font-semibold ${colors.text}`}>{t('addAccount.title')}</h2>
          </div>
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-white/10' : 'hover:bg-black/5'}`}>
            <X size={18} className={colors.textMuted} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 保存本地账号 */}
          <button 
            onClick={handleSaveLocal} 
            disabled={addLoading} 
            className={`w-full flex items-center gap-4 px-4 py-4 ${isDark ? 'bg-emerald-500/10 border-emerald-500/20 hover:bg-emerald-500/15' : 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100'} border rounded-xl transition-all disabled:opacity-50 active:scale-[0.98]`}
          >
            <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'} flex items-center justify-center`}>
              <Download size={20} className="text-emerald-500" />
            </div>
            <div className="text-left">
              <div className={`font-medium ${colors.text}`}>{t('addAccount.saveLocal')}</div>
              <div className={`text-xs ${colors.textMuted}`}>{t('addAccount.saveLocalDesc')}</div>
            </div>
          </button>

          {/* 分隔线 */}
          <div className="flex items-center gap-3">
            <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}></div>
            <span className={`text-xs ${colors.textMuted}`}>{t('addAccount.orManual')}</span>
            <div className={`flex-1 h-px ${isDark ? 'bg-white/10' : 'bg-gray-200'}`}></div>
          </div>

          {/* 类型切换 */}
          <div className={`flex gap-1 p-1 rounded-xl ${isDark ? 'bg-white/5' : 'bg-gray-100'}`}>
            <button 
              type="button" 
              onClick={() => setAddType('social')} 
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${addType === 'social' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : `${colors.text} hover:bg-white/10`}`}
            >
              <Key size={14} />
              Google/GitHub
            </button>
            <button 
              type="button" 
              onClick={() => setAddType('idc')} 
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${addType === 'idc' ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/25' : `${colors.text} hover:bg-white/10`}`}
            >
              <Shield size={14} />
              BuilderId/Enterprise
            </button>
          </div>

          {/* 表单 */}
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>{t('addAccount.refreshToken')}</label>
              <input 
                type="text" 
                placeholder={addType === 'social' ? t('addAccount.socialPlaceholder') : t('addAccount.idcPlaceholder')} 
                value={refreshToken} 
                onChange={(e) => setRefreshToken(e.target.value)} 
                className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all`} 
              />
            </div>

            {addType === 'idc' && (
              <>
                <div>
                  <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>{t('addAccount.clientId')}</label>
                  <input 
                    type="text" 
                    placeholder="OIDC Client ID" 
                    value={clientId} 
                    onChange={(e) => setClientId(e.target.value)} 
                    className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all`} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>{t('addAccount.clientSecret')}</label>
                  <input 
                    type="password" 
                    placeholder="OIDC Client Secret" 
                    value={clientSecret} 
                    onChange={(e) => setClientSecret(e.target.value)} 
                    className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all`} 
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium ${colors.textMuted} mb-1.5`}>{t('addAccount.awsRegion')}</label>
                  <div className="relative">
                    <select 
                      value={region} 
                      onChange={(e) => setRegion(e.target.value)} 
                      className={`w-full px-4 py-3 border rounded-xl text-sm ${colors.text} ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-gray-200'} focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all appearance-none cursor-pointer`}
                    >
                      {awsRegions.map((r) => (<option key={r.value} value={r.value} className="text-gray-900 bg-white">{r.label}</option>))}
                    </select>
                    <ChevronDown size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${colors.textMuted} pointer-events-none`} />
                  </div>
                </div>
              </>
            )}

            <button 
              onClick={handleAddManual} 
              disabled={addLoading || !refreshToken} 
              className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-500 text-white rounded-xl text-sm font-medium shadow-lg shadow-blue-500/25 hover:from-blue-600 hover:to-purple-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            >
              {addLoading ? t('addAccount.verifying') : t('addAccount.add')}
            </button>
          </div>

          {/* Error */}
          {addError && (
            <div className={`text-sm text-red-500 ${isDark ? 'bg-red-500/10 border-red-500/20' : 'bg-red-50 border-red-200'} border px-4 py-3 rounded-xl`}>
              {addError}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes dialogIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(-10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

export default AddAccountModal
