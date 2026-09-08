import React from 'react'
import ReactDOM from 'react-dom/client'
import AppShell from './AppShell'
import './styles.css'

window.addEventListener('unhandledrejection', (e) => {
  console.error('[dev] unhandledrejection:', e.reason)
})

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppShell />
  </React.StrictMode>
)
