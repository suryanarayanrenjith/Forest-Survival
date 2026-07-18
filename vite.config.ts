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
    // Rapier physics is a single WASM-embedding module (~2MB minified) that
    // cannot be subdivided — and it is only fetched lazily when a solo-mode
    // death ragdoll first needs it, so it never delays page load. The limit
    // sits just above it so real regressions in eagerly-loaded chunks still
    // trip the warning.
    chunkSizeWarningLimit: 2100,
    rollupOptions: {
      output: {
        manualChunks: {
          'three': ['three'],
          'peerjs': ['peerjs'],
          // Splitting the framework + backend client out of the app chunk
          // keeps the game-code chunk smaller and lets browsers keep cached
          // vendor bytes across game updates (these change far less often).
          'react-vendor': ['react', 'react-dom', 'react-dom/client'],
          // These packages only expose subpath entries — list the ones the
          // app actually imports (a bare 'convex'/'@convex-dev/auth' fails
          // to resolve at build time).
          'convex': ['convex/react', 'convex/server', 'convex/values', '@convex-dev/auth/react'],
        },
      },
    },
  },
})
