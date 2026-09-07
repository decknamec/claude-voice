import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'
import { connectShell } from './lib/shell.ts'

// Runs before the first render: the shell strips the token from the URL, and
// lib/api.ts reads it while the module loads.
connectShell()

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
