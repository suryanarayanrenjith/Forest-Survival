import { StrictMode, Suspense, lazy, useEffect, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { ConvexReactClient } from 'convex/react'
import { ConvexAuthProvider } from '@convex-dev/auth/react'
import './index.css'
import { PlayerDataProvider } from './hooks/usePlayerData'

// ── WHY App IS LAZY ────────────────────────────────────────────────────────
// App.tsx is the entire game engine: ~18k lines plus three.js plus every combat
// system, and it was a STATIC import. That meant the browser had to download,
// parse and execute roughly 600 KB (gzipped) of game code before a single
// pixel of the MENU could appear — which is what pinned Largest Contentful
// Paint at ~14 s in the field data.
//
// Splitting it here means first paint only needs React + the Convex client:
// the static boot hero in index.html is already on screen from the server
// response, the menu arrives as soon as its chunk lands, and the game engine
// streams in behind both. Nothing about the game changes — it is the same
// module, fetched one tick later.
const App = lazy(() => import('./App.tsx'))

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string)

// ── STALE-CHUNK GUARD ──────────────────────────────────────────────────────
// Now that the app is code-split, a tab left open across a deploy will ask for
// a hashed chunk that no longer exists. Without this the dynamic import just
// rejects, Suspense never resolves, and the boot hero sits there forever —
// a permanently "loading" game. Vite fires `vite:preloadError` for exactly
// this; one reload picks up the new manifest. The sessionStorage latch means a
// genuinely broken deploy fails visibly instead of reload-looping.
window.addEventListener('vite:preloadError', (event) => {
  const RELOAD_KEY = 'fs:chunk-reload'
  if (sessionStorage.getItem(RELOAD_KEY)) return
  sessionStorage.setItem(RELOAD_KEY, '1')
  event.preventDefault()
  window.location.reload()
})
// A clean load means whatever was stale is resolved — re-arm the guard.
window.addEventListener('load', () => {
  try { sessionStorage.removeItem('fs:chunk-reload') } catch { /* private mode */ }
})

/**
 * Retires the server-rendered boot hero once the real UI has mounted.
 *
 * The hero is a FIXED, full-viewport overlay, so removing it cannot move
 * anything — Cumulative Layout Shift stays at 0, which it currently is and
 * must remain. It fades rather than popping, and it is removed from the DOM
 * afterwards so it can never eat a click.
 */
export function BootGate({ children }: { children: ReactNode }) {
  useEffect(() => {
    const el = document.getElementById('boot')
    if (!el) return
    el.classList.add('boot-out')
    const t = window.setTimeout(() => el.remove(), 500)
    return () => window.clearTimeout(t)
  }, [])
  return children
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConvexAuthProvider client={convex}>
      <PlayerDataProvider>
        {/* fallback is null on purpose: the boot hero IS the loading state, and
            swapping in a second one would flash two different screens. */}
        <Suspense fallback={null}>
          <BootGate>
            <App />
          </BootGate>
        </Suspense>
      </PlayerDataProvider>
    </ConvexAuthProvider>
  </StrictMode>,
)
