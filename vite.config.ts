import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Lists every emitted file so the service worker can precache the whole app for offline use. */
function precacheManifest(): Plugin {
  return {
    name: 'cardforge-precache-manifest',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((name) => !name.endsWith('.map'))
      this.emitFile({ type: 'asset', fileName: 'precache-manifest.json', source: JSON.stringify(files) })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), precacheManifest()],
  build: { chunkSizeWarningLimit: 700 },
})