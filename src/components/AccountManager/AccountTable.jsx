import { Users, Plus } from 'lucide-react'
import { useTheme } from '../../contexts/ThemeContext'
import { useI18n } from '../../i18n.jsx'
import AccountCard from './AccountCard'

function AccountTable({
  accounts,
  filteredAccounts,
  selectedIds,
  onSelectAll,
  onSelectOne,
  copiedId,
  onCopy,
  onSwitch,
  onRefresh,
  onEdit,
  onEditLabel,
  onDelete,
  onAdd,
  refreshingId,
  switchingId,
  localToken,
}) {
  const { theme, colors } = useTheme()
  const { t } = useI18n()
  const isDark = theme === 'dark'

  return (
    <div className="flex-1 overflow-auto p-6">
      {/* 全选控制栏 */}
      {accounts.length > 0 && (
        <div className={`flex items-center gap-3 mb-4 px-1`}>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.length === filteredAccounts.length && filteredAccounts.length > 0}
              onChange={(e) => onSelectAll(e.target.checked)}
              className="w-4 h-4 rounded transition-transform hover:scale-110"
            />
            <span className={`text-sm ${colors.textMuted}`}>
              {selectedIds.length > 0 ? `${t('common.selected')} ${selectedIds.length}` : t('common.selectAll')}
            </span>
          </label>
        </div>
      )}

      {/* 卡片网格 */}
      {accounts.length === 0 ? (
        <div className={`flex flex-col items-center justify-center py-20 ${colors.textMuted}`}>
          <div className={`w-20 h-20 rounded-full ${isDark ? 'bg-white/5' : 'bg-gray-100'} flex items-center justify-center animate-float mb-4`}>
            <Users size={40} strokeWidth={1} className="opacity-50" />
          </div>
          <p className="font-medium mb-1">{t('common.noAccounts')}</p>
          <p className="text-sm opacity-75">{t('common.addAccountHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              isSelected={selectedIds.includes(account.id)}
              onSelect={(checked) => onSelectOne(account.id, checked)}
              copiedId={copiedId}
              onCopy={onCopy}
              onSwitch={onSwitch}
              onRefresh={onRefresh}
              onEdit={onEdit}
              onEditLabel={onEditLabel}
              onDelete={onDelete}
              refreshingId={refreshingId}
              switchingId={switchingId}
              isCurrentAccount={localToken?.refreshToken && account.refreshToken === localToken.refreshToken}
            />
          ))}
          {/* 添加账号卡片 */}
          <button
            onClick={onAdd}
            className={`rounded-2xl border-2 border-dashed transition-all duration-200 min-h-[280px] flex flex-col items-center justify-center gap-3 ${
              isDark 
                ? 'border-gray-700 hover:border-gray-500 hover:bg-white/5' 
                : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
            }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isDark ? 'bg-white/10' : 'bg-gray-100'
            }`}>
              <Plus size={24} className={colors.textMuted} />
            </div>
            <span className={`text-sm font-medium ${colors.textMuted}`}>{t('common.addAccount')}</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default AccountTable
