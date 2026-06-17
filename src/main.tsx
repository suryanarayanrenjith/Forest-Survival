// MUST be first: raises the global texture anisotropy default before any
// module-level texture singleton (in App and its util imports) is constructed.
import './utils/textureDefaults'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import './index.css'
import App from './App.tsx'
import { PlayerDataProvider } from './hooks/usePlayerData'

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <PlayerDataProvider>
        <App />
      </PlayerDataProvider>
    </ConvexAuthProvider>
  </StrictMode>,
)
