import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App.jsx'
import { ThemeProvider } from './contexts/ThemeContext.jsx'
import { DialogProvider } from './contexts/DialogContext.jsx'
import { I18nProvider } from './i18n.jsx'
import './index.css'

// 生产环境禁用浏览器快捷键
if (import.meta.env.PROD) {
  document.addEventListener('keydown', (e) => {
    // F5 - 刷新
    // F12 - 开发者工具
    if (e.key === 'F5' || e.key === 'F12') {
      e.preventDefault()
      return false
    }
    
    // Ctrl 组合键
    if (e.ctrlKey) {
      const key = e.key.toLowerCase()
      // Ctrl+R - 刷新
      // Ctrl+U - 查看源码
      // Ctrl+P - 打印
      // Ctrl+S - 保存
      // Ctrl+G - 查找
      // Ctrl+F - 页面搜索
      if (['r', 'u', 'p', 's', 'g', 'f'].includes(key)) {
        e.preventDefault()
        return false
      }
      // Ctrl+Shift+I/J - 开发者工具
      if (e.shiftKey && ['i', 'j'].includes(key)) {
        e.preventDefault()
        return false
      }
    }
  })
  
  // 禁用右键菜单
  document.addEventListener('contextmenu', (e) => {
    e.preventDefault()
    return false
  })
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <ThemeProvider>
        <DialogProvider>
          <App />
        </DialogProvider>
      </ThemeProvider>
    </I18nProvider>
  </React.StrictMode>,
)

// 页面加载完成后显示窗口
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    getCurrentWindow().show()
  }, 100)
})
