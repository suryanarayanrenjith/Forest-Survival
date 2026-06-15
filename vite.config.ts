import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
        // App.tsx is a single ~500KB+ module (the whole game engine lives in
        // one file). That trips @babel/generator's `compact: "auto"` heuristic,
        // which deoptimises its output formatting and logs a
        // "[BABEL] Note: ...has deoptimised the styling..." line on every build.
        // Setting `compact` explicitly for just that file stops the heuristic
        // (and the note). It only changes whitespace in Babel's intermediate
        // output — Vite minifies for production anyway — so there is ZERO effect
        // on game logic or runtime behaviour.
        overrides: [
          {
            test: /App\.tsx$/,
            compact: true,
          },
        ],
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
