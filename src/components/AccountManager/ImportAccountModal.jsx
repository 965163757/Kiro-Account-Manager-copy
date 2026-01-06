import { useState, useRef } from 'react'
import { X, Upload, FileJson, AlertCircle, CheckCircle, Loader2, Key, FileCode } from 'lucide-react'
import { invoke } from '@tauri-apps/api/core'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n.jsx'

// 校验单条账号数据（兼容导出格式和手动输入格式）
function validateAccount(item, index) {
  const errors = []
  
  // 兼容导出格式：refreshToken 可能在 item.refreshToken
  const refreshToken = item.refreshToken
  if (!refreshToken) {
    errors.push(`第${index + 1}条: 缺少 refreshToken`)
    return { valid: false, errors, type: null }
  }
  
  // 所有 refreshToken 都以 aor 开头（无论 Social 还是 IdC）
  if (!refreshToken.startsWith('aor')) {
    errors.push(`第${index + 1}条: refreshToken 格式无效（应以 aor 开头）`)
    return { valid: false, errors, type: null }
  }
  
  // 通过是否有 clientId/clientSecret 来判断账号类型
  // IdC 账号（BuilderId/Enterprise）需要 clientId 和 clientSecret
  // Social 账号（Google/GitHub）不需要这些字段
  const hasClientCredentials = item.clientId && item.clientSecret
  const isIdC = hasClientCredentials
  const isSocial = !hasClientCredentials
  
  // 如果没有 provider，根据账号类型推断
  let provider = item.provider
  if (!provider) {
    provider = isSocial ? 'Google' : 'BuilderId'
  }
  
  const validProviders = ['Google', 'GitHub', 'BuilderId', 'Enterprise']
  if (!validProviders.includes(provider)) {
    errors.push(`第${index + 1}条: provider 必须是 ${validProviders.join('/')}`)
    return { valid: false, errors, type: null }
  }
  
  // 校验 provider 与账号类型匹配
  if (isSocial && !['Google', 'GitHub'].includes(provider)) {
    errors.push(`第${index + 1}条: Social 账号（无 clientId/clientSecret）的 provider 应为 Google/GitHub`)
    return { valid: false, errors, type: null }
  }
  
  if (isIdC && !['BuilderId', 'Enterprise'].includes(provider)) {
    errors.push(`第${index + 1}条: IdC 账号（有 clientId/clientSecret）的 provider 应为 BuilderId/Enterprise`)
    return { valid: false, errors, type: null }
  }
  
  return { valid: true, errors: [], type: isSocial ? 'social' : 'idc', inferredProvider: provider }
}


function ImportAccountModal({ onClose, onSuccess }) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  const fileInputRef = useRef(null)
  
  // Tab 状态
  const [activeTab, setActiveTab] = useState('json') // 'json' | 'sso'
  
  // JSON 导入状态
  const [jsonText, setJsonText] = useState('')
  const [parseResult, setParseResult] = useState(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, currentEmail: '' })
  const [importResult, setImportResult] = useState(null)

  // SSO Token 导入状态
  const [ssoToken, setSsoToken] = useState('')
  const [ssoRegion, setSsoRegion] = useState('us-east-1')
  const [ssoImporting, setSsoImporting] = useState(false)
  const [ssoProgress, setSsoProgress] = useState({ current: 0, total: 0 })
  const [ssoResult, setSsoResult] = useState(null)

  // 解析 JSON
  const parseJson = (text) => {
    if (!text.trim()) {
      setParseResult(null)
      return
    }
    
    try {
      let data = JSON.parse(text)
      if (!Array.isArray(data)) {
        data = [data]
      }
      
      const valid = []
      const invalid = []
      const errors = []
      
      data.forEach((item, index) => {
        const result = validateAccount(item, index)
        if (result.valid) {
          valid.push({ ...item, _type: result.type, _index: index, _inferredProvider: result.inferredProvider })
        } else {
          invalid.push({ ...item, _index: index })
          errors.push(...result.errors)
        }
      })
      
      setParseResult({ valid, invalid, errors })
    } catch (e) {
      setParseResult({ valid: [], invalid: [], errors: [`JSON 解析失败: ${e.message}`] })
    }
  }

  // 选择文件
  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const text = await file.text()
    setJsonText(text)
    parseJson(text)
  }

  // 输入框变化
  const handleTextChange = (e) => {
    const text = e.target.value
    setJsonText(text)
    parseJson(text)
  }

  // 执行 JSON 导入
  const handleJsonImport = async () => {
    if (!parseResult?.valid.length) return
    
    setImporting(true)
    setImportProgress({ current: 0, total: parseResult.valid.length, currentEmail: '' })
    
    const success = []
    const failed = []
    
    for (let i = 0; i < parseResult.valid.length; i++) {
      const item = parseResult.valid[i]
      setImportProgress({ 
        current: i, 
        total: parseResult.valid.length, 
        currentEmail: item.refreshToken.slice(0, 20) + '...' 
      })
      
      try {
        let account
        // 使用推断的 provider（兼容导出格式）
        const provider = item._inferredProvider || item.provider
        if (item._type === 'social') {
          account = await invoke('add_account_by_social', {
            refreshToken: item.refreshToken,
            provider: provider
          })
        } else {
          account = await invoke('add_account_by_idc', {
            refreshToken: item.refreshToken,
            clientId: item.clientId,
            clientSecret: item.clientSecret,
            region: item.region || null
          })
        }
        success.push({ index: item._index + 1, email: account.email })
      } catch (e) {
        failed.push({ index: item._index + 1, error: String(e).slice(0, 50) })
      }
      
      if (i < parseResult.valid.length - 1) {
        await new Promise(r => setTimeout(r, 500))
      }
    }
    
    setImportProgress({ current: parseResult.valid.length, total: parseResult.valid.length, currentEmail: '' })
    setImportResult({ success, failed })
    setImporting(false)
    
    if (success.length > 0) {
      onSuccess?.()
    }
  }

  // 执行 SSO Token 导入
  const handleSsoImport = async () => {
    const tokens = ssoToken.split('\n').map(t => t.trim()).filter(t => t)
    if (tokens.length === 0) return
    
    setSsoImporting(true)
    setSsoProgress({ current: 0, total: tokens.length })
    
    const success = []
    const failed = []
    
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      setSsoProgress({ current: i, total: tokens.length })
      
      try {
        const result = await invoke('import_from_sso_token', {
          bearerToken: token,
          region: ssoRegion || null
        })
        if (result.success) {
          success.push({ index: i + 1, email: result.email })
        } else {
          failed.push({ index: i + 1, error: result.error || '未知错误' })
        }
      } catch (e) {
        failed.push({ index: i + 1, error: String(e).slice(0, 80) })
      }
      
      // 间隔避免请求过快
      if (i < tokens.length - 1) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }
    
    setSsoProgress({ current: tokens.length, total: tokens.length })
    setSsoResult({ success, failed })
    setSsoImporting(false)
    
    if (success.length > 0) {
      onSuccess?.()
    }
  }

  // 关闭弹窗
  const handleClose = () => {
    if (importing || ssoImporting) return
    onClose()
  }

  // 重置状态
  const handleReset = () => {
    setImportResult(null)
    setSsoResult(null)
    setJsonText('')
    setSsoToken('')
    setParseResult(null)
  }

  // 渲染结果
  const renderResult = (result) => (
    <div className="space-y-4">
      <div className={`p-4 rounded-xl ${isDark ? 'bg-green-500/20' : 'bg-green-50'}`}>
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle size={20} className="text-green-500" />
          <span className={`font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
            {t('import.successCount', { count: result.success.length })}
          </span>
        </div>
        {result.success.length > 0 && (
          <div className={`text-sm ${isDark ? 'text-green-400' : 'text-green-600'}`}>
            {result.success.map(s => s.email).join(', ')}
          </div>
        )}
      </div>
      
      {result.failed.length > 0 && (
        <div className={`p-4 rounded-xl ${isDark ? 'bg-red-500/20' : 'bg-red-50'}`}>
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={20} className="text-red-500" />
            <span className={`font-medium ${isDark ? 'text-red-300' : 'text-red-700'}`}>
              {t('import.failedCount', { count: result.failed.length })}
            </span>
          </div>
          <div className={`text-sm space-y-1 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
            {result.failed.map((f, i) => (
              <div key={i}>#{f.index}: {f.error}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // 渲染进度
  const renderProgress = (progress, isSSO = false) => (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Loader2 size={20} className="text-blue-500 animate-spin" />
        <span className={colors.text}>{isSSO ? t('import.ssoImporting') : t('import.importing')}</span>
      </div>
      <div className={`h-2 ${isDark ? 'bg-white/10' : 'bg-gray-200'} rounded-full overflow-hidden`}>
        <div 
          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
          style={{ width: `${(progress.current / progress.total) * 100}%` }}
        />
      </div>
      <div className={`text-sm ${colors.textMuted}`}>
        {progress.current}/{progress.total}
      </div>
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={handleClose}>
      <div 
        className={`${colors.card} rounded-2xl shadow-2xl w-[600px] max-h-[80vh] flex flex-col`}
        onClick={e => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${colors.cardBorder}`}>
          <h2 className={`text-lg font-semibold ${colors.text}`}>{t('import.title')}</h2>
          <button 
            onClick={handleClose}
            disabled={importing || ssoImporting}
            className={`p-1 rounded-lg ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} transition-colors disabled:opacity-50`}
          >
            <X size={20} className={colors.textMuted} />
          </button>
        </div>

        {/* Tab 切换 */}
        {!importResult && !ssoResult && !importing && !ssoImporting && (
          <div className={`flex border-b ${colors.cardBorder}`}>
            <button
              onClick={() => setActiveTab('json')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'json' 
                  ? `${colors.text} border-b-2 border-blue-500` 
                  : `${colors.textMuted} hover:${colors.text}`
              }`}
            >
              <FileJson size={16} />
              {t('import.jsonTab')}
            </button>
            <button
              onClick={() => setActiveTab('sso')}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'sso' 
                  ? `${colors.text} border-b-2 border-blue-500` 
                  : `${colors.textMuted} hover:${colors.text}`
              }`}
            >
              <Key size={16} />
              {t('import.ssoTab')}
            </button>
          </div>
        )}

        {/* 内容区 */}
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {/* JSON 导入结果 */}
          {importResult && renderResult(importResult)}
          
          {/* SSO 导入结果 */}
          {ssoResult && renderResult(ssoResult)}
          
          {/* JSON 导入进度 */}
          {importing && renderProgress(importProgress, false)}
          
          {/* SSO 导入进度 */}
          {ssoImporting && renderProgress(ssoProgress, true)}
          
          {/* JSON 导入输入区 */}
          {!importResult && !ssoResult && !importing && !ssoImporting && activeTab === 'json' && (
            <>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className={`flex items-center gap-2 px-4 py-2 ${isDark ? 'bg-white/10 hover:bg-white/15' : 'bg-gray-100 hover:bg-gray-200'} rounded-xl transition-colors`}
                >
                  <FileJson size={18} className={colors.textMuted} />
                  <span className={colors.text}>{t('import.selectFile')}</span>
                </button>
                <button
                  onClick={() => {
                    const template = JSON.stringify([{
                      refreshToken: "",
                      provider: "Google"
                    }], null, 2)
                    setJsonText(template)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 ${isDark ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-300' : 'bg-blue-50 hover:bg-blue-100 text-blue-600'} rounded-xl transition-colors text-sm`}
                >
                  <FileCode size={16} />
                  Social 模板
                </button>
                <button
                  onClick={() => {
                    const template = JSON.stringify([{
                      refreshToken: "",
                      clientId: "",
                      clientSecret: "",
                      region: "us-east-1",
                      provider: "BuilderId"
                    }], null, 2)
                    setJsonText(template)
                  }}
                  className={`flex items-center gap-2 px-3 py-2 ${isDark ? 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300' : 'bg-purple-50 hover:bg-purple-100 text-purple-600'} rounded-xl transition-colors text-sm`}
                >
                  <FileCode size={16} />
                  IdC 模板
                </button>
              </div>

              <div>
                <label className={`block text-sm font-medium ${colors.text} mb-1`}>
                  {t('import.orPaste')}
                </label>
                <textarea
                  value={jsonText}
                  onChange={handleTextChange}
                  rows={10}
                  placeholder={`[
  {
    "refreshToken": "aorxxxxxxxx",
    "provider": "Google"
  },
  {
    "refreshToken": "aorxxxxxxxx",
    "clientId": "xxxxxxxx",
    "clientSecret": "xxxxxxxx",
    "region": "us-east-1",
    "provider": "BuilderId"
  }
]`}
                  className={`w-full px-3 py-2 rounded-xl border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none`}
                />
              </div>

              {parseResult && (
                <div className="space-y-2">
                  {parseResult.valid.length > 0 && (
                    <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                      <CheckCircle size={16} />
                      <span>{t('import.parseSuccess')}: {parseResult.valid.length} {t('import.validRecords')}</span>
                    </div>
                  )}
                  {parseResult.errors.length > 0 && (
                    <div className={`p-3 rounded-lg ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertCircle size={16} className="text-red-500" />
                        <span className={`text-sm font-medium ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                          {t('import.validationError')}
                        </span>
                      </div>
                      <div className={`text-xs space-y-0.5 ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                        {parseResult.errors.slice(0, 5).map((err, i) => (
                          <div key={i}>{err}</div>
                        ))}
                        {parseResult.errors.length > 5 && (
                          <div>{t('import.moreErrors', { count: parseResult.errors.length - 5 })}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* SSO Token 导入输入区 */}
          {!importResult && !ssoResult && !importing && !ssoImporting && activeTab === 'sso' && (
            <>
              <div className={`p-3 rounded-xl ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'} border ${isDark ? 'border-blue-500/20' : 'border-blue-200'}`}>
                <div className={`text-sm ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                  <p className="font-medium mb-1">{t('import.ssoGuide')}</p>
                  <ol className="list-decimal list-inside space-y-0.5 text-xs">
                    <li>{t('import.ssoStep1')}</li>
                    <li>{t('import.ssoStep2')}</li>
                    <li>{t('import.ssoStep3')}</li>
                    <li>{t('import.ssoStep4')}</li>
                  </ol>
                </div>
              </div>

              <div>
                <label className={`block text-sm font-medium ${colors.text} mb-1`}>
                  {t('import.ssoTokenLabel')}
                  <span className={`ml-2 text-xs font-normal ${colors.textMuted}`}>{t('import.ssoTokenHint')}</span>
                </label>
                <textarea
                  value={ssoToken}
                  onChange={(e) => setSsoToken(e.target.value)}
                  rows={6}
                  placeholder={t('import.ssoTokenPlaceholder')}
                  className={`w-full px-3 py-2 rounded-xl border ${colors.cardBorder} ${isDark ? 'bg-white/5' : 'bg-gray-50'} ${colors.text} text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/30 resize-none`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium ${colors.text} mb-1`}>
                  Region <span className={`text-xs font-normal ${colors.textMuted}`}>{t('import.regionOptional')}</span>
                </label>
                <select
                  value={ssoRegion}
                  onChange={(e) => setSsoRegion(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border ${colors.cardBorder} ${isDark ? 'bg-zinc-800 text-white' : 'bg-gray-50 text-gray-900'} text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30`}
                >
                  <option value="us-east-1" className={isDark ? 'bg-zinc-800' : ''}>us-east-1</option>
                  <option value="us-west-2" className={isDark ? 'bg-zinc-800' : ''}>us-west-2</option>
                  <option value="eu-west-1" className={isDark ? 'bg-zinc-800' : ''}>eu-west-1</option>
                  <option value="ap-northeast-1" className={isDark ? 'bg-zinc-800' : ''}>ap-northeast-1</option>
                </select>
              </div>

              {ssoToken.trim() && (
                <div className={`flex items-center gap-2 text-sm ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  <CheckCircle size={16} />
                  <span>{t('import.detectedTokens', { count: ssoToken.split('\n').filter(t => t.trim()).length })}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* 底部按钮 */}
        <div className={`flex justify-end gap-3 px-6 py-4 border-t ${colors.cardBorder}`}>
          {(importResult || ssoResult) ? (
            <>
              <button
                onClick={handleReset}
                className={`px-4 py-2 rounded-xl ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${colors.text}`}
              >
                {t('import.continueImport')}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium"
              >
                {t('import.done')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                disabled={importing || ssoImporting}
                className={`px-4 py-2 rounded-xl ${isDark ? 'hover:bg-white/10' : 'hover:bg-gray-100'} ${colors.text} disabled:opacity-50`}
              >
                {t('common.cancel')}
              </button>
              {activeTab === 'json' ? (
                <button
                  onClick={handleJsonImport}
                  disabled={importing || !parseResult?.valid.length}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Upload size={16} />
                  {t('import.import')} {parseResult?.valid.length ? `(${parseResult.valid.length})` : ''}
                </button>
              ) : (
                <button
                  onClick={handleSsoImport}
                  disabled={ssoImporting || !ssoToken.trim()}
                  className="px-4 py-2 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-medium hover:from-blue-600 hover:to-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  <Key size={16} />
                  {t('import.import')} {ssoToken.trim() ? `(${ssoToken.split('\n').filter(t => t.trim()).length})` : ''}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default ImportAccountModal
