import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  build: {
    chunkSizeWarningLimit: 1500, // Three.js core chunk is ~700kB by itself
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'peerjs': ['peerjs'],
        },
      },
    },
  },
})
