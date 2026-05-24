import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react'

const REALISM_EFFECTS_COMPAT_ID = '\0realism-effects-three-compat'

function realismEffectsThreeCompat(): PluginOption {
  return {
    name: 'realism-effects-three-compat',
    enforce: 'pre',
    resolveId(id) {
      return id === 'realism-effects' ? REALISM_EFFECTS_COMPAT_ID : null
    },
    load(id) {
      if (id !== REALISM_EFFECTS_COMPAT_ID) return null

      const packagePath = fileURLToPath(
        new URL('./node_modules/realism-effects/dist/index.js', import.meta.url),
      )
      const source = readFileSync(packagePath, 'utf8')
      const patchedSource = source.replace(
        'UniformsUtils, WebGLMultipleRenderTargets, ShaderMaterial',
        'UniformsUtils, ShaderMaterial',
      )

      if (patchedSource === source) {
        throw new Error('realism-effects compatibility shim could not patch the Three.js MRT import.')
      }

      return patchedSource.replace(
        'var vertexShader =',
        `class WebGLMultipleRenderTargets extends WebGLRenderTarget {
  constructor(width = 1, height = 1, count = 1, options = {}) {
    super(width, height, { ...options, count });
    this.isWebGLMultipleRenderTargets = true;
  }

  get texture() {
    return this.textures;
  }

  set texture(value) {
    this.textures = value;
  }
}

var vertexShader =`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    realismEffectsThreeCompat(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
  ],
  optimizeDeps: {
    exclude: ['realism-effects'],
  },
  build: {
    chunkSizeWarningLimit: 1500, // Increase limit for Three.js bundle size
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
