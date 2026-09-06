import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// Eine einzige Datei als Ergebnis. Die Seite haelt das Sitzungs-Token und darf
// Claude mit bypassPermissions steuern — sie soll zur Laufzeit nichts
// nachladen und nirgends hinreichen. Die Abhaengigkeiten existieren beim
// Bauen, nicht im Auslieferungsstand.
export default defineConfig({
  plugins: [react(), tailwind(), viteSingleFile()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 4000,
    cssCodeSplit: false,
    target: 'es2022'
  }
})
