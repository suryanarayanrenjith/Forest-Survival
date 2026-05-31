<div align="center">

<img src="public/Forest.png" alt="Forest Survival" width="220" />

# Forest Survival

A 3D first-person survival shooter built entirely through vibe coding — powered by React, TypeScript, Three.js, and AI-assisted development from the ground up.

> **Vibe Coded** — Every line of gameplay logic, AI behavior, multiplayer networking, and UI was generated through conversational AI coding. No manual game engine. Just vibes and prompts.

</div>

---

## 🎮 Gameplay

Survive endless, escalating waves of enemies across **eight distinct biome maps**. Fight 4 enemy types with 7 unlockable weapons, collect power-ups, chain combo kills, and push your wave count and score as high as you can.

### Objective
Endless survival — every cleared wave spawns a harder one. Climb the waves, build your score, and stay alive as long as you can.

### Maps
Eight hand-crafted, premium low-poly environments — each with its own biome, palette, atmosphere and props: **Deep Forest**, **Scorched Wasteland**, **Frozen Tundra**, **Desert Canyon**, **Toxic Swamp**, **Military Outpost**, **Twilight Vale** and **Ancient Ruins**.

---

## 🔫 Weapons

Weapons unlock as your score climbs:

| Weapon | Unlock Score | Ammo | Fire Rate |
|--------|-------------|------|-----------|
| Pistol | 0 | 12 | 300ms |
| Rifle | 100 | 30 | 150ms |
| Shotgun | 200 | 8 | 800ms |
| SMG | 300 | 40 | 100ms |
| Sniper | 500 | 5 | 1200ms |
| Minigun | 800 | 100 | 50ms |
| Rocket Launcher | 1200 | 3 | 2000ms |

---

## 👾 Enemies

Premium low-poly creatures with chest cores, shoulder plating, glowing visors and head crests. Base HP scales up with difficulty and wave number.

| Type | Color | Base HP | Behavior |
|------|-------|---------|----------|
| Normal | Crimson | 50 | Balanced aggression |
| Fast | Blue | 30 | Quick and agile, dodges bullets |
| Tank | Green | 150 | Slow, heavy hitter |
| Boss | Violet | 300 | Tactical, coordinates with others |

---

## ✨ Features

**Core Gameplay**
- Wave-based survival with scaling difficulty
- Combo system — chain kills within 2 seconds for bonus points
- Kill streaks with tiered notifications
- Achievement system with unlockables
- Procedural mission system with 14 mission types across 6 difficulty tiers

**AI Systems**
- Adaptive difficulty that adjusts to your skill in real time
- Enemy AI with state-machine behavior: patrol, hunt, ambush, coordinate, retreat
- Steering-based navigation — repulsion avoidance and wall-sliding so enemies arc around trees instead of getting stuck
- Bullet dodging on agile enemies
- Combat coaching with live tips
- Predictive enemy spawning
- Smart skill tree progression

**Visuals & Atmosphere**
- Premium low-poly art direction — custom-built creatures, weapons and per-biome props
- Volumetric custom sky shader with day/night cycle, drifting clouds, stars and moon
- Image-based lighting — environment reflections that make metals read as real metal
- 8 distinct biomes with unique palettes, fog and atmosphere
- Ground Truth Ambient Occlusion (GTAO), Unreal-style mip-chain bloom, screen-space god rays, ACES filmic tone mapping and cinematic colour grading — all running on three.js's native postprocessing stack (no external FX libraries)
- Blood splatter, muzzle flash and impact effects

**Multiplayer**
- Peer-to-peer multiplayer via PeerJS (no dedicated game server)
- Host-authoritative **shared enemy world** — every player fights the same enemies in the same positions; an enemy attacking one player is reflected for everyone
- Up to 8 players, 8 selectable character classes, co-op and last-man-standing modes
- Floating name tags + health bars above every player
- In-game chat with quick emotes, live scoreboard HUD, spectator mode and game-over screens

**Accounts & Progression** (powered by Convex)
- Username / password accounts via Convex Auth — no email required
- Persistent progression stored as a single compact Convex document per player (stats, skill points, achievements bitmask, avatar)
- Account rank (Bronze → Master) and level driven by kills and wins, not games played
- Smart skill tree unlocked with points earned from Solo runs
- Achievements are Solo-only; cross-device settings sync; privacy-aware public profiles

**UI & Polish**
- Cohesive, professional dark UI built with hand-crafted Tailwind styling
- Crisp `lucide-react` SVG iconography throughout — zero emoji chrome
- Dynamic crosshair, hit markers and floating damage numbers
- Kill feed, combo display and achievement toasts
- Screen shake and damage flash effects
- Skill tree, mission display, stats gallery
- Themed tutorial that freezes the world while you read each step
- Full settings menu with persistence

**Mobile & Tablet** (best on desktop — see [Mobile & Tablet](#-mobile--tablet))
- Auto-detected touch controls: virtual joystick, swipe-to-look, and on-screen
  buttons for every action
- Console-style aim assist for touch players
- Landscape orientation gate + best-effort fullscreen/orientation lock
- Compact, non-overlapping HUD, menus and multiplayer scoreboard/chat tuned for
  small screens and the visible (dynamic) viewport

---

## 🎁 Power-Ups

Spawn between waves, with a chance to drop from fallen enemies:

- **Ammo Crate** — Refill your current magazine
- **Speed Boost** — Faster movement (10s)
- **Damage Boost** — Double weapon damage (15s)
- **Shield** — Deployable riot shield that absorbs front-arc damage (12s)
- **Infinite Ammo** — Unlimited ammo burst, no reloads
- **Overcharge** — Fire-rate + damage surge
- **Phantom** — Cloak: enemies can't see or hear you, and you pass through them

> By design there is **no healing** power-up — your only damage mitigation is the shield and not getting hit.

---

## 🎮 Controls

### Desktop (keyboard & mouse)

| Key | Action |
|-----|--------|
| W / A / S / D | Move |
| Mouse | Look around |
| Left Click | Shoot |
| Right Click | Aim (Rifle / Sniper) |
| Space | Jump |
| Shift | Sprint |
| C | Crouch |
| Q | Dash |
| R | Reload |
| 1–7 / Scroll | Switch weapons |
| E / F / V / B | Abilities |
| ESC | Pause |

---

## 📱 Mobile & Tablet

> ⚠️ **Best experienced on desktop or laptop.** Forest Survival is built and tuned
> for keyboard & mouse. It is **fully playable** on phones and tablets via on-screen
> touch controls, but the mobile experience may not be as polished — for the best
> experience, play on a desktop or laptop.

Touch devices are auto-detected and the game remaps to on-screen controls:

| Touch control | Action |
|---------------|--------|
| Left joystick | Move (push to the edge to sprint) |
| Swipe right side | Look around (with console-style **aim assist**) |
| FIRE button | Shoot |
| Aim button | Aim down sights (Rifle / Sniper) |
| Jump / Dash / Crouch buttons | Movement actions |
| Power button | Use held power-up |
| Reload button | Reload |
| Weapon button | Switch weapons |
| Pause button | Pause menu |

- **Landscape only** — a rotate prompt appears in portrait; the game requests
  fullscreen + landscape lock on start where supported.
- The HUD, menus and multiplayer scoreboard/chat all adapt to a compact,
  non-overlapping touch layout sized to the visible viewport.

---

## 📊 Scoring

| Kill | Points |
|------|--------|
| Normal Enemy | 10 |
| Fast Enemy | 15 |
| Tank Enemy | 30 |
| Boss Enemy | 100 |
| Combo Bonus | +5 × multiplier |

---

## 🚀 Getting Started

```bash
cd forest-survival

npm install        # Install dependencies
npm run dev        # Dev server at localhost:5173
npm run build      # Production build
npm run lint       # Lint check
npm run preview    # Preview production build
```

Accounts, multiplayer ranks and progression are backed by **Convex**. For these to work locally, provision a dev backend once and leave it running in a second terminal — it writes `VITE_CONVEX_URL` into `.env.local` for you (see `.env.example`):

```bash
npx convex dev          # provisions the dev DB, pushes functions, syncs .env.local
npx @convex-dev/auth     # one-time: generate the auth keys on the dev deployment
```

---

## 🛠️ Tech Stack

| Category | Technology |
|----------|------------|
| Framework | React 19 |
| Language | TypeScript 5 (strict) |
| 3D Engine | Three.js + @react-three/fiber + @react-three/drei |
| Post-processing | three.js native (EffectComposer + GTAO + UnrealBloom + SMAA + custom ACES grade) |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS |
| Icons | lucide-react |
| Multiplayer | PeerJS (peer-to-peer) |
| Backend & Database | Convex (reactive DB + serverless functions) |
| Authentication | Convex Auth (username / password) |
| Hosting | Vercel |

---

## 📁 Project Structure

```
forest-survival/
├── src/
│   ├── App.tsx              # Core game engine — scene, loop, physics, combat
│   ├── main.tsx             # React entry point
│   ├── index.css            # Global styles
│   ├── types/
│   │   └── game.ts          # All TypeScript interfaces
│   ├── components/          # 24 React UI components
│   │   ├── HUD.tsx
│   │   ├── MainMenu.tsx
│   │   ├── GameOver.tsx
│   │   ├── PauseMenu.tsx
│   │   ├── MultiplayerLobby.tsx
│   │   ├── SkillTreeMenu.tsx
│   │   ├── MissionDisplay.tsx
│   │   └── ...
│   └── utils/               # 25 game system utilities
│       ├── AIBehaviorSystem.ts
│       ├── WeatherSystem.ts
│       ├── MultiplayerManager.ts
│       ├── SoundManager.ts
│       ├── SmartEnemyManager.ts
│       └── ...
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

---

## 📝 License

[MIT](https://github.com/suryanarayanrenjith/Forest-Survival/blob/master/LICENSE)
