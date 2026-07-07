import React from 'react'
import ReactDOM from 'react-dom/client'
import { Buffer } from 'buffer'
import process from 'process'
import { Web3AuthProvider } from './web3auth'
import App from './App'
import './index.css'

if (typeof window !== 'undefined') {
  window.Buffer = Buffer
  window.process = process as any
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Web3AuthProvider>
      <App />
    </Web3AuthProvider>
  </React.StrictMode>,
)
