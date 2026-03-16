import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5000',
      '/sw.js': 'http://localhost:5000',
    },
  },
  build: {
    outDir: '../static/dist',
    emptyOutDir: true,
  },
})
