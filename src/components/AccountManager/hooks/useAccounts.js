import { useState, useEffect, useCallback } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getQuota, getUsed } from '../../../utils/accountStats'

export function useAccounts() {
  const [accounts, setAccounts] = useState([])
  const [autoRefreshing, setAutoRefreshing] = useState(false)
  const [refreshProgress, setRefreshProgress] = useState({ current: 0, total: 0, currentEmail: '', results: [] })
  const [lastRefreshTime, setLastRefreshTime] = useState(null)
  const [refreshingId, setRefreshingId] = useState(null)
  const [switchingId, setSwitchingId] = useState(null)

  const isExpiringSoon = useCallback((account) => {
    if (!account.expiresAt) return true
    const expiresAt = new Date(account.expiresAt.replace(/\//g, '-'))
    return expiresAt.getTime() - Date.now() < 5 * 60 * 1000
  }, [])

  const loadAccounts = useCallback(async () => {
    try {
      setAccounts(await invoke('get_accounts'))
    } catch (e) {
      console.error(e)
    }
  }, [])

  const autoRefreshAll = useCallback(async (accountList, forceAll = false) => {
    if (autoRefreshing || accountList.length === 0) return
    const accountsToRefresh = forceAll ? accountList : accountList.filter(isExpiringSoon)
    if (accountsToRefresh.length === 0) return

    setAutoRefreshing(true)
    setRefreshProgress({ current: 0, total: accountsToRefresh.length, currentEmail: '', results: [] })

    const updatedAccounts = [...accountList]
    const results = []

    for (let i = 0; i < accountsToRefresh.length; i++) {
      const account = accountsToRefresh[i]
      setRefreshProgress(prev => ({ ...prev, currentEmail: account.email }))
      let success = false, message = ''
      try {
        // 只刷新 token，不获取 usage
        const updated = await invoke('refresh_account_token', { id: account.id })
        const idx = updatedAccounts.findIndex(a => a.id === account.id)
        if (idx !== -1) updatedAccounts[idx] = updated
        success = true
        message = 'Token 已刷新'
      } catch (e) {
        message = String(e).slice(0, 30)
      }
      results.push({ email: account.email, success, message })
      setRefreshProgress({ current: i + 1, total: accountsToRefresh.length, currentEmail: '', results: [...results] })
      if (i < accountsToRefresh.length - 1) await new Promise(r => setTimeout(r, 500))
    }

    setAccounts(updatedAccounts)
    setLastRefreshTime(new Date().toLocaleTimeString())
    setTimeout(() => {
      setAutoRefreshing(false)
      setRefreshProgress({ current: 0, total: 0, currentEmail: '', results: [] })
    }, 1500)
  }, [autoRefreshing, isExpiringSoon])


  const handleRefreshStatus = useCallback(async (id) => {
    setRefreshingId(id)
    try {
      const updated = await invoke('sync_account', { id })
      setAccounts(prev => prev.map(a => a.id === id ? updated : a))
      return { success: true }
    } catch (e) {
      console.warn(e)
      // 更新账号状态为错误信息
      const errorMsg = String(e)
      setAccounts(prev => prev.map(a => a.id === id ? { ...a, status: errorMsg.includes('401') || errorMsg.includes('过期') ? 'Token已失效' : '刷新失败' } : a))
      return { success: false, error: errorMsg }
    } finally {
      setRefreshingId(null)
    }
  }, [])

  const handleExport = useCallback(async (selectedIds = []) => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog')
      const { writeTextFile } = await import('@tauri-apps/plugin-fs')
      const { downloadDir } = await import('@tauri-apps/api/path')
      
      const suffix = selectedIds.length > 0 ? `-${selectedIds.length}` : ''
      const defaultName = `kiro-accounts${suffix}-${new Date().toISOString().slice(0, 10)}.json`
      const defaultDir = await downloadDir()
      
      const filePath = await save({
        defaultPath: `${defaultDir}${defaultName}`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
        title: '导出账号数据'
      })
      
      if (!filePath) return // 用户取消
      
      const json = await invoke('export_accounts', { ids: selectedIds.length > 0 ? selectedIds : null })
      await writeTextFile(filePath, json)
    } catch (e) {
      console.error('导出失败:', e)
    }
  }, [])

  // 注意：handleDelete, handleBatchDelete, handleSwitchAccount 已移动到 AccountManager/index.jsx 中
  // 使用 useDialog 的 showConfirm 实现自定义弹窗
  // 这里只保留 setSwitchingId 供组件使用

  // 初始化和事件监听
  useEffect(() => {
    loadAccounts()
    const unlistenLoginSuccess = listen('login-success', () => loadAccounts())
    const unlistenKiroLoginData = listen('kiro-login-data', async (event) => {
      try {
        const data = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload
        if (data?.accessToken && data?.refreshToken) {
          await invoke('add_kiro_account', {
            email: data.email || 'unknown@kiro.dev',
            accessToken: data.accessToken,
            refreshToken: data.refreshToken,
            csrfToken: data.csrfToken || '',
            idp: data.idp || 'Google',
            quota: data.quota ?? null,
            used: data.used ?? null
          })
          loadAccounts()
        }
      } catch (e) {
        console.error('Failed to handle kiro-login-data:', e)
      }
    })

    const interval = setInterval(async () => {
      if (document.hidden) return
      const data = await invoke('get_accounts')
      if (data.length > 0) autoRefreshAll(data)
    }, 5 * 60 * 1000)

    return () => {
      unlistenLoginSuccess.then(fn => fn())
      unlistenKiroLoginData.then(fn => fn())
      clearInterval(interval)
    }
  }, [loadAccounts, autoRefreshAll])

  return {
    accounts,
    loadAccounts,
    autoRefreshing,
    refreshProgress,
    lastRefreshTime,
    refreshingId,
    switchingId,
    setSwitchingId,
    autoRefreshAll,
    handleRefreshStatus,
    handleExport,
  }
}
