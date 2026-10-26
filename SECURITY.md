# Security

Forest Survival is a static client-side game with a Convex backend. There is no game
server: multiplayer is peer-to-peer over WebRTC, with the host authoritative.

## Reporting a vulnerability

Please report security issues privately via
[GitHub Security Advisories](https://github.com/suryanarayanrenjith/Forest-Survival/security/advisories/new)
rather than opening a public issue.

---

## Response headers

All headers are configured in [`vercel.json`](vercel.json). **`vercel.json` is schema-validated
and rejects unknown properties — it cannot contain comments of any kind** (`//`, `$comment`
and JSONC all fail the build with *"should NOT have additional property"*). That is why this
file exists: it is the commentary the config itself cannot carry.

| Header | Value | Why |
|---|---|---|
| `Content-Security-Policy` | see below | Egress allowlist + XSS containment |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Force HTTPS |
| `X-Content-Type-Options` | `nosniff` | No MIME sniffing |
| `X-Frame-Options` / `frame-ancestors` | `DENY` / `'none'` | Anti-clickjacking |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Don't leak paths off-site |
| `Cross-Origin-Opener-Policy` | `same-origin` | Process isolation |
| `Cross-Origin-Resource-Policy` | `same-origin`, `cross-origin` for media | See note below |
| `X-Permitted-Cross-Domain-Policies` | `none` | No Flash/PDF cross-domain policy |
| `Origin-Agent-Cluster` | `?1` | Request origin-keyed agent cluster |
| `Permissions-Policy` | 17 features denied | Least privilege |

### `connect-src` is an allowlist — keep it in sync

It was previously `'self' https: wss:`, meaning an XSS or one compromised npm package could
exfiltrate to any host on the internet. It is now restricted to the **four** origins this app
genuinely talks to:

| Origin | Used by | Notes |
|---|---|---|
| `*.convex.cloud` (https + wss) | Realtime sync, queries/mutations, file storage | **Wildcarded deliberately** — prod, dev and every Vercel preview use a *different* deployment subdomain. Pinning one host breaks previews. |
| `*.convex.site` (https + wss) | Convex HTTP actions (`convex/http.ts`) | Same wildcard reasoning. |
| `0.peerjs.com` (https + wss) | PeerJS signalling | The code calls bare `new Peer()`, so it uses PeerJS's `CLOUD_HOST`. Multiplayer path only. |
| `dl.polyhaven.org` | HDRI environment maps | ⚠ Easy to miss — see [`src/utils/HDRIEnvironment.ts`](src/utils/HDRIEnvironment.ts). High/Ultra tiers only. |

Vercel Analytics and Speed Insights are **same-origin** (`/_vercel/*`), covered by `'self'`.
WebRTC STUN/TURN is **not** governed by `connect-src`, so peer connectivity is unaffected.

**If you add a network call to a new host, add it here — CSP failures appear in production
only, because local dev serves no CSP.**

### Other CSP notes

- `'wasm-unsafe-eval'` in `script-src` is **load-bearing for Rapier** (the physics WASM
  module behind ragdolls, throwables and debris). Do not remove it.
- `img-src` does not allow arbitrary `https:`. Auth is username/password with **no OAuth
  provider**, so there are no external avatar hosts; `users.image` is never written by app
  code, and `UserAvatar` already falls back to initials on load error.
- `manifest-src 'self'` is required — manifests fall back to `default-src`.
- The static content pages (`/guide`, `/weapons`, …) get their **own much stricter policy**
  (`default-src 'none'`), because they are pure HTML with no scripts, no network calls and no
  WASM. `script-src` stays `'self'` there for exactly one reason: to guarantee the
  `application/ld+json` structured-data block is never at risk. Nothing is exploitable via
  that allowance — it would require placing a `.js` file on this origin, which a static build
  makes impossible.

### Permissions-Policy: two features are intentionally NOT denied

`fullscreen` and `screen-wake-lock` must stay allowed — the game uses `requestFullscreen`
(`src/App.tsx`) and `src/utils/wakeLock.ts`. Denying them breaks gameplay.

### Cross-Origin-Resource-Policy

`same-origin` globally, overridden to `cross-origin` for images/media. Social scrapers fetch
`og-image.jpg` server-side where CORP is not enforced, so this is belt-and-braces — it simply
removes a class of "why is my link preview blank" failure.

---

## Known trade-offs

- **`X-Frame-Options: DENY` blocks game-portal embedding.** CrazyGames, Poki and itch.io
  embed games in an iframe, which this forbids. Relaxing it means replacing `DENY` with a
  named `frame-ancestors` allowlist **and deleting `X-Frame-Options`** (it would otherwise
  override `frame-ancestors`). That is a distribution decision, not a routine config change.
- **AI crawlers must not be firewalled.** `public/robots.txt` explicitly welcomes retrieval
  crawlers (OAI-SearchBot, Claude-SearchBot, PerplexityBot, …). If Vercel's Firewall or Bot
  Management challenges them, they receive `403` and the stated policy is a lie. Verify with:
  ```bash
  for UA in GPTBot ClaudeBot PerplexityBot OAI-SearchBot; do
    curl -A "Mozilla/5.0 (compatible; $UA/1.0)" -sS -o /dev/null \
         -w "$UA %{http_code}\n" https://forestsurvival.live/guide
  done
  ```
- **One third-party runtime origin remains:** the Poly Haven HDRI CDN
  (`dl.polyhaven.org`). Self-hosting the `.hdr` files would let it be dropped from the CSP
  entirely, leaving the app with zero third-party runtime dependencies.
  *(Google Fonts was the other one and is now gone — see below.)*

## Fonts are self-hosted

Oswald and Chakra Petch are served from **this origin** (`public/fonts/`, declared at the top
of `src/index.css` and inlined in each static page). `fonts.googleapis.com` and
`fonts.gstatic.com` have been removed from `style-src` and `font-src` accordingly.

**Do not reintroduce the Google Fonts `<link>`.** It was a render-blocking cross-origin
stylesheet on the critical path, cost two extra DNS+TLS handshakes, leaked visitor IPs and
User-Agents to a third party, and forced two origins into the CSP.

Notes for anyone touching the fonts:
- Only the **latin** and **latin-ext** subsets are shipped (this site is English). Glyphs
  outside those `unicode-range`s fall back per-glyph to the system stack.
- **Oswald is a variable font** — one file per subset covers weights 300–700, declared once
  with a `font-weight` range. Do not split it back into five static weights.
- Chakra Petch is static: one file per weight per subset.
- The `<link rel="preload" as="font" … crossorigin>` tags **must** keep `crossorigin`; fonts
  are always fetched in CORS mode, and without it the browser downloads them twice.
- Total cost: 10 files, 148 KB on disk, and a browser only fetches the subsets and weights a
  given page actually renders.

## Dependencies

`npm audit` is expected to report **0 vulnerabilities**. Run it before releasing.
`package.json` can't carry comments either, so the non-obvious entries are explained here:

| Entry | Why |
|---|---|
| `overrides.postcss-selector-parser: ^7.1.7` | Tailwind 3 (via `postcss-nested`) still asks for `^6`, and every 6.x is affected by GHSA-rj75-hqrm-r3gf / GHSA-w9m9-85wc-3x92. The only fix is 7.1.6+, whose one major change (safe insertion during iteration) Tailwind doesn't depend on — the generated CSS was verified **byte-identical** before and after. Drop the override once Tailwind is upgraded to v4. |
| `overrides.ws`, `overrides.@auth/core` | Pin patched versions of transitive deps from `peerjs` / `@convex-dev/auth`. |
| `lucia` (direct dependency) | `convex/auth.ts` imports `Scrypt` from it for password hashing. It used to arrive only transitively through `@convex-dev/auth`; declared explicitly (same `^3.2` range, deduped) so a future auth release that drops it can't silently break sign-in. |
| `motion` (exact pin) | UI animation library, pinned exactly to a release that had been public for over two weeks when adopted. Bump deliberately, not via `^`. |
| `vite`, `baseline-browser-mapping` floors | Raised to the first patched versions so a lockfile-less install can't resolve a vulnerable release. |

Dependabot alerts on GitHub track the same advisory database as `npm audit`; if the two
disagree, re-run `npm audit` against a fresh `npm install`.
