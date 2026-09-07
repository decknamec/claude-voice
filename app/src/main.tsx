import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './styles.css'
import { verbindeSchale } from './lib/schale.ts'

// Muss vor dem ersten Zeichnen laufen: die Schale putzt das Token aus der URL,
// und api.ts liest es beim Laden des Moduls.
verbindeSchale()

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>
)
