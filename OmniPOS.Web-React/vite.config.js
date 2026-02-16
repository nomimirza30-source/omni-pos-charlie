import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'mask-icon.svg'],
            manifest: {
                name: 'OmniPOS - Luxury Dining',
                short_name: 'OmniPOS',
                description: 'Premium Multi-Platform Point of Sale System',
                theme_color: '#0f172a',
                icons: [
                    {
                        src: 'pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable'
                    }
                ]
            }
        })
    ],
    server: {
        host: '0.0.0.0', // Bind to all interfaces (required for mobile access)
        proxy: {
            '/api': {
                target: 'http://localhost:5200',
                changeOrigin: true,
                secure: false
            },
            '/hubs': {
                target: 'http://localhost:5200',
                changeOrigin: true,
                secure: false,
                ws: true
            },
            '/uploads': {
                target: 'http://localhost:5200',
                changeOrigin: true,
                secure: false
            }
        }
    }
})
