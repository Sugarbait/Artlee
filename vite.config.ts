import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { copyFileSync, mkdirSync, readFileSync } from 'fs'
import { execSync } from 'child_process'

// Read package.json for version
const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Get git commit hash (first 7 characters)
let gitCommitHash = 'dev'
try {
  gitCommitHash = execSync('git rev-parse HEAD').toString().trim().substring(0, 7)
} catch (e) {
  console.warn('⚠️ Could not get git commit hash, using "dev"')
}

// Get current build date
const buildDate = new Date().toISOString().split('T')[0]

export default defineConfig({
  // Define environment variables for Azure Static Web Apps
  define: {
    // Ensure environment variables are properly injected during build
    __VITE_SUPABASE_URL__: JSON.stringify(process.env.VITE_SUPABASE_URL),
    __VITE_SUPABASE_ANON_KEY__: JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    __VITE_SUPABASE_SERVICE_ROLE_KEY__: JSON.stringify(process.env.VITE_SUPABASE_SERVICE_ROLE_KEY),
    __VITE_AZURE_CLIENT_ID__: JSON.stringify(process.env.VITE_AZURE_CLIENT_ID),
    __VITE_AZURE_TENANT_ID__: JSON.stringify(process.env.VITE_AZURE_TENANT_ID),
    __VITE_HIPAA_MODE__: JSON.stringify(process.env.VITE_HIPAA_MODE)
  },
  // Make version info available to app
  envPrefix: 'VITE_',
  plugins: [
    react(),
    // Plugin to inject version information
    {
      name: 'inject-version-info',
      config() {
        return {
          define: {
            'import.meta.env.VITE_APP_VERSION': JSON.stringify(packageJson.version),
            'import.meta.env.VITE_GIT_COMMIT_HASH': JSON.stringify(gitCommitHash),
            'import.meta.env.VITE_BUILD_DATE': JSON.stringify(buildDate)
          }
        }
      }
    },
    // Plugin to copy Azure Static Web Apps files
    {
      name: 'copy-azure-files',
      generateBundle() {
        // Copy staticwebapp.config.json to dist
        try {
          copyFileSync('staticwebapp.config.json', 'dist/staticwebapp.config.json')
          console.log('✅ Copied staticwebapp.config.json to dist/')
        } catch (error) {
          console.warn('⚠️ Failed to copy staticwebapp.config.json:', error)
        }

        // Copy 404.html to dist
        try {
          copyFileSync('404.html', 'dist/404.html')
          console.log('✅ Copied 404.html to dist/')
        } catch (error) {
          console.warn('⚠️ Failed to copy 404.html:', error)
        }

        // Copy Azure environment injection script
        try {
          // Ensure the directory exists
          const targetDir = path.dirname('dist/src/config/azure-env-inject.js')
          mkdirSync(targetDir, { recursive: true })

          copyFileSync('src/config/azure-env-inject.js', 'dist/src/config/azure-env-inject.js')
          console.log('✅ Copied azure-env-inject.js to dist/')
        } catch (error) {
          console.warn('⚠️ Failed to copy azure-env-inject.js:', error)
        }
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'ARTLEE Business CRM',
        short_name: 'ARTLEE',
        description: 'Business platform CRM with Retell AI integration',
        theme_color: '#0056B3',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait-primary',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.retellai\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'retell-api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    target: 'es2015',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false, // Keep console logs for debugging notes issues
        drop_debugger: true
      }
    },
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Large third-party libraries get their own chunks
          if (id.includes('html2canvas')) {
            return 'html2canvas'
          }
          // All other node_modules go into vendor chunk
          if (id.includes('node_modules')) {
            return 'vendor'
          }
          // Everything else stays in main chunk
          return undefined
        }
      }
    }
  },
  server: {
    port: 2222,
    headers: {
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin'
    }
  }
})