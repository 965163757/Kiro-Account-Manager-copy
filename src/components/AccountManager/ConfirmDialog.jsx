import { AlertTriangle, CheckCircle, XCircle, Info, X } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n'

/**
 * 通用确认/提示对话框
 * @param {string} type - 'confirm' | 'success' | 'error' | 'info'
 * @param {string} title - 标题
 * @param {string} message - 内容
 * @param {function} onConfirm - 确认回调
 * @param {function} onCancel - 取消回调
 * @param {string} confirmText - 确认按钮文字
 * @param {string} cancelText - 取消按钮文字
 */
function ConfirmDialog({
  type = 'confirm',
  title,
  message,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  loading = false,
}) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'
  
  // Use i18n defaults if not provided
  const finalConfirmText = confirmText || t('common.ok')
  const finalCancelText = cancelText || t('common.cancel')

  const config = {
    confirm: {
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      iconBg: 'bg-gradient-to-br from-amber-500/20 to-orange-500/10',
      headerGradient: 'from-amber-500/10 via-transparent to-transparent',
      accentColor: 'amber',
      btnGradient: 'from-blue-500 to-blue-600',
      btnShadow: 'shadow-blue-500/30',
    },
    success: {
      icon: CheckCircle,
      iconColor: 'text-emerald-400',
      iconBg: 'bg-gradient-to-br from-emerald-500/20 to-green-500/10',
      headerGradient: 'from-emerald-500/10 via-transparent to-transparent',
      accentColor: 'emerald',
      btnGradient: 'from-emerald-500 to-emerald-600',
      btnShadow: 'shadow-emerald-500/30',
    },
    error: {
      icon: XCircle,
      iconColor: 'text-red-400',
      iconBg: 'bg-gradient-to-br from-red-500/20 to-rose-500/10',
      headerGradient: 'from-red-500/10 via-transparent to-transparent',
      accentColor: 'red',
      btnGradient: 'from-red-500 to-red-600',
      btnShadow: 'shadow-red-500/30',
    },
    info: {
      icon: Info,
      iconColor: 'text-blue-400',
      iconBg: 'bg-gradient-to-br from-blue-500/20 to-indigo-500/10',
      headerGradient: 'from-blue-500/10 via-transparent to-transparent',
      accentColor: 'blue',
      btnGradient: 'from-blue-500 to-blue-600',
      btnShadow: 'shadow-blue-500/30',
    },
  }

  const { icon: Icon, iconColor, iconBg, headerGradient, btnGradient, btnShadow } = config[type]

  return (
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-fade-in"
      onClick={onCancel}
    >
      <div 
        className={`
          relative overflow-hidden
          ${isDark ? 'bg-[#1a1a1a]' : 'bg-white'} 
          rounded-2xl w-full max-w-[400px] 
          shadow-2xl ${isDark ? 'shadow-black/50' : 'shadow-gray-200/50'}
          border ${isDark ? 'border-white/10' : 'border-gray-200'}
        `}
        onClick={e => e.stopPropagation()}
        style={{ animation: 'dialogSlideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
      >
        {/* 顶部渐变装饰 */}
        <div className={`absolute top-0 left-0 right-0 h-32 bg-gradient-to-b ${headerGradient} pointer-events-none`} />
        
        {/* 装饰性光晕 */}
        <div className={`absolute -top-20 -right-20 w-40 h-40 bg-gradient-to-br ${iconBg} rounded-full blur-3xl opacity-50`} />
        
        {/* Header */}
        <div className="relative px-6 pt-6 pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className={`
                w-12 h-12 rounded-2xl ${iconBg} 
                flex items-center justify-center
                ring-1 ${isDark ? 'ring-white/10' : 'ring-black/5'}
                shadow-lg
              `}>
                <Icon size={24} className={iconColor} strokeWidth={2} />
              </div>
              <div>
                <h2 className={`text-lg font-semibold ${colors.text} leading-tight`}>{title}</h2>
              </div>
            </div>
            <button 
              onClick={onCancel} 
              className={`
                p-2 rounded-xl transition-all duration-200
                ${isDark ? 'hover:bg-white/10 active:bg-white/5' : 'hover:bg-gray-100 active:bg-gray-50'}
              `}
            >
              <X size={18} className={colors.textMuted} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="relative px-6 py-4">
          <p className={`${colors.textMuted} text-sm leading-relaxed whitespace-pre-line`}>
            {message}
          </p>
        </div>

        {/* Footer */}
        <div className={`
          relative px-6 py-5 
          ${isDark ? 'bg-white/[0.02] border-t border-white/5' : 'bg-gray-50/80 border-t border-gray-100'}
          flex justify-end gap-3
        `}>
          {type === 'confirm' && (
            <button
              onClick={onCancel}
              className={`
                px-5 py-2.5 text-sm font-medium rounded-xl 
                ${isDark ? 'bg-white/5 hover:bg-white/10 text-white/80 border border-white/10' : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'}
                transition-all duration-200 active:scale-[0.98]
              `}
            >
              {finalCancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`
              px-6 py-2.5 text-sm font-medium rounded-xl text-white
              bg-gradient-to-r ${btnGradient}
              shadow-lg ${btnShadow}
              hover:opacity-90 hover:shadow-xl
              disabled:opacity-50 disabled:cursor-not-allowed 
              flex items-center gap-2 
              transition-all duration-200 active:scale-[0.98]
            `}
          >
            {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            {finalConfirmText}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dialogSlideIn {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(-20px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }
      `}</style>
    </div>
  )
}

export default ConfirmDialog
