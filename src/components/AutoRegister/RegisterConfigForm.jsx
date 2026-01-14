import { UserPlus, AtSign, Key, Hash } from 'lucide-react'

function RegisterConfigForm({ config, onChange, colors, isDark, t }) {
  return (
    <section className={`card-glow ${colors.card} rounded-2xl p-6 shadow-sm border ${colors.cardBorder}`}>
      <div className="flex items-center gap-2 mb-1">
        <UserPlus size={18} className="text-purple-500" />
        <h2 className={`text-lg font-semibold ${colors.text}`}>{t('autoRegister.registerConfig')}</h2>
      </div>
      <p className={`text-sm ${colors.textMuted} mb-5`}>{t('autoRegister.registerConfigDesc')}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* 邮箱前缀 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>
            <AtSign size={14} className="inline mr-1" />
            {t('autoRegister.emailPrefix')}
          </label>
          <input
            type="text"
            value={config.emailPrefix}
            onChange={(e) => onChange({ emailPrefix: e.target.value })}
            placeholder="myprefix"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
          <p className={`text-xs ${colors.textMuted} mt-1`}>{t('autoRegister.emailPrefixHint')}</p>
        </div>

        {/* 邮箱域名 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>{t('autoRegister.emailDomain')}</label>
          <input
            type="text"
            value={config.emailDomain}
            onChange={(e) => onChange({ emailDomain: e.target.value })}
            placeholder="@gmail.com"
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>

        {/* 密码长度 */}
        <div>
          <label className={`block text-sm ${colors.textMuted} mb-2`}>
            <Key size={14} className="inline mr-1" />
            {t('autoRegister.passwordLength')}
          </label>
          <input
            type="number"
            value={config.passwordLength}
            onChange={(e) => onChange({ passwordLength: parseInt(e.target.value) || 16 })}
            min={8}
            max={32}
            className={`w-full px-4 py-3 border rounded-xl ${colors.text} ${colors.input} ${colors.inputFocus} focus:ring-2 transition-all`}
          />
        </div>

        {/* 占位 */}
        <div></div>
      </div>

      {/* 密码规则 */}
      <div className="mt-4">
        <label className={`block text-sm ${colors.textMuted} mb-3`}>
          <Hash size={14} className="inline mr-1" />
          {t('autoRegister.passwordRules')}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-3 transition-all`}>
            <input
              type="checkbox"
              checked={config.passwordIncludeUppercase}
              onChange={(e) => onChange({ passwordIncludeUppercase: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className={`text-sm ${colors.text}`}>{t('autoRegister.includeUppercase')}</span>
          </label>

          <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-3 transition-all`}>
            <input
              type="checkbox"
              checked={config.passwordIncludeLowercase}
              onChange={(e) => onChange({ passwordIncludeLowercase: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className={`text-sm ${colors.text}`}>{t('autoRegister.includeLowercase')}</span>
          </label>

          <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-3 transition-all`}>
            <input
              type="checkbox"
              checked={config.passwordIncludeNumbers}
              onChange={(e) => onChange({ passwordIncludeNumbers: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className={`text-sm ${colors.text}`}>{t('autoRegister.includeNumbers')}</span>
          </label>

          <label className={`flex items-center gap-3 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-3 transition-all`}>
            <input
              type="checkbox"
              checked={config.passwordIncludeSpecial}
              onChange={(e) => onChange({ passwordIncludeSpecial: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
            />
            <span className={`text-sm ${colors.text}`}>{t('autoRegister.includeSpecial')}</span>
          </label>
        </div>
      </div>

      {/* 随机名字 */}
      <label className={`flex items-center gap-3 mt-4 cursor-pointer ${isDark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all`}>
        <input
          type="checkbox"
          checked={config.useRandomName}
          onChange={(e) => onChange({ useRandomName: e.target.checked })}
          className="w-4 h-4 rounded-lg border-gray-300 text-blue-500 focus:ring-blue-500"
        />
        <UserPlus size={16} className={colors.textMuted} />
        <div>
          <span className={`text-sm font-medium ${colors.text}`}>{t('autoRegister.useRandomName')}</span>
          <p className={`text-xs ${colors.textMuted}`}>{t('autoRegister.useRandomNameDesc')}</p>
        </div>
      </label>
    </section>
  )
}

export default RegisterConfigForm
