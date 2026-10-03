import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Pocket Wallet',
        short_name: 'Pocket',
        description: 'A calm, local-first personal finance wallet.',
        theme_color: '#f5f5f7',
        background_color: '#f5f5f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/wallet.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }
        ]
      }
    })
  ]
})
