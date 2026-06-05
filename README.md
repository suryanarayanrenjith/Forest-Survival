<div align="center">

<img src="public/Forest.png" alt="Forest Survival" width="220" />

# Forest Survival

A 3D first-person survival shooter built entirely through vibe coding — powered by React, TypeScript, Three.js, and AI-assisted development from the ground up.

> **Vibe Coded** — Every line of gameplay logic, AI behavior, multiplayer networking, and UI was generated through conversational AI coding. No manual game engine. Just vibes and prompts.

</div>

---

## 🎮 Gameplay

Survive endless, escalating waves of enemies across **eight distinct biome maps**. Fight 5 enemy types with 7 unlockable weapons, gamble on a Mystery Box between waves, chase per-weapon mastery levels, hunt today's mutator + daily challenge, and push your wave count and score as high as you can.

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

Every weapon earns its own **mastery XP** as you kill with it (see **Weapon Mastery** below).

---

## 👾 Enemies

Premium low-poly creatures with chest cores, shoulder plating, knee/elbow pads, glowing waist belts, back-vent panels, glowing visors and head crests. Base HP scales up with difficulty and wave number.

| Type | Color | Base HP | First seen | Behavior |
|------|-------|---------|------------|----------|
| Normal | Crimson | 50 | Wave 1 | Balanced aggression — closes for melee |
| Fast | Blue | 30 | Wave 2 | Quick, agile, dodges bullets |
| Tank | Green | 150 | Wave 3 | Slow, heavy hitter |
| **Sniper (Ranged)** | **Cyan** | **40** | **Wave 4** | **Stops at distance, charges a telegraphed energy bolt, retreats** |
| Boss | Violet | 300 | Wave 5 | Tactical, coordinates with others |

### Mini-bosses & Boss Phases
- **Crowned Elite** — every wave divisible by 5 (but not boss waves) spawns a tank wearing a yellow crown with **4× HP** and **3× score payout**, announced with a "New Threat" banner.
- **Boss Enrage** — full bosses transition into **Phase 2** at 50% HP: **+35% speed, +30% damage**, paired with a damage flash, screen shake, low-pitched roar and centred "BOSS ENRAGED" banner.

### Environmental Threats
- **Explosive Barrels** — red metal barrels scattered across each map. Bullet hits chip them down; a fatal hit detonates in a radius that damages enemies *and the player*, and **chain-reacts** through any other barrel in the blast.
- **Ranged Sentinels** — stationary laser turrets (3–4 per map on harder difficulties, dormant until wave 3). Telegraph each shot with a glowing red head before firing a hitscan beam. Trees block line of sight. Destroying one drops **+150 score**.

---

## ✨ Features

**Core Gameplay**
- Wave-based survival with scaling difficulty
- Combo system — chain kills within 2 seconds for bonus points
- Kill streaks with tiered notifications
- Achievement system with **19 unlockable Titles** that show up in the kill feed
- Procedural mission system with 14 mission types across 6 difficulty tiers

**Roguelike Wave Progression**
- 🎁 **Mystery Box** picker between waves — three face-down crates. One hides a perk; pick wisely. Number keys highlight, Enter opens.
- **15 stackable perks** in the registry (Hair Trigger, Iron Lung, Bloodletting, Drum Magazine, Detonators, Streak Keeper, Vampiric Edge, etc.) — each can appear **at most once per run** so a long run shapes a unique build.
- **Consolation reward** on a miss — wrong box still pays out `25 + wave×6` **Weapon Mastery XP**.
- Picked perks visible in the top-left HUD as coloured rarity chips throughout the run.

**Daily Mutators** *(Run Modifiers)*
Before each Classic run, choose one of three daily-rotated risk-reward modifiers — or skip for the baseline. Rotates at UTC midnight; same trio for every player that day.

| Modifier | Effect | Score |
|----------|--------|-------|
| Skull Hunter | Body shots tickle — headshots only | ×1.75 |
| Berserker | 2× damage, ½ max HP | ×1.60 |
| Glass Cannon | 3× damage, 25 HP cap | ×2.20 |
| Swarm Mode | +80% enemy spawn rate, ½ enemy HP | ×1.50 |
| One in the Chamber | Start with 1 round per weapon | ×2.00 |
| Bullet Hell | Enemies hit harder and move faster | ×1.70 |

The active mutator displays as a pulsing rose chip at the top of the HUD throughout the run.

**Daily Challenges** *(signed-in)*
A single rotating challenge per UTC day, shown on the Main Menu. Progress ticks during any Classic run. Completing it grants **+1 Skill Point** on claim.

> Examples: *Daily Cull* (100 kills), *Long Watch* (reach wave 10), *Skull Splitter* (25 headshots), *Untouchable* (3 flawless waves), *Pistols at Dawn* (30 pistol kills).

**Killstreak Airdrops**
Earn an escalating airdrop for an unbroken killstreak — a military-style crate parachutes in (sectored chute, metal banding, glowing top panel, pulsing red strobe).

| Streak | Reward |
|--------|--------|
| 5 | **Rapid Fire** — 3× fire rate for 15s |
| 10 | **Invincibility** — 5 seconds of immunity |
| 15 | **Mystery Box** — random weapon + full ammo |
| 20 | **Tactical Nuke** — vaporise every enemy on screen |

**Weapon Mastery** *(signed-in)*
Every weapon has its own **L0 → L10 mastery** ladder. Kills grant XP scaled by enemy type (bosses pay big, fast enemies pay small) and persist server-side per account. A small amber sliver under the ammo counter tracks the current weapon's XP into the next level. Per-level bonuses:

| Level | Unlock |
|------|--------|
| L3 | −5% reload time |
| L5 | −5% recoil |
| L7 | Muzzle-flash tint |
| L10 | +25% reload, +15% recoil reduction, +25% magazine size |

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
- **Seamless world streaming** — 5 × 5 chunk grid (~350m visible) with tightened distance fog that blends new chunks into the sky tone, so the player never sees a "world ends here" pop-in
- Ground Truth Ambient Occlusion (GTAO), Unreal-style mip-chain bloom, screen-space god rays, ACES filmic tone mapping and cinematic colour grading — all running on three.js's native postprocessing stack (no external FX libraries)
- Blood splatter, muzzle flash and impact effects

**Multiplayer**
- Peer-to-peer multiplayer via PeerJS (no dedicated game server)
- Host-authoritative **shared enemy world** — every player fights the same enemies in the same positions; an enemy attacking one player is reflected for everyone
- Up to 8 players, **8 selectable character classes with mechanical passives**
- Mystery Box runs in multiplayer too with an 8s auto-pick countdown so a distracted player can't stall the match
- Floating name tags + health bars above every player
- In-game chat with quick emotes, live scoreboard HUD, spectator mode and game-over screens

### Multiplayer Character Passives

| Character | Passive |
|-----------|---------|
| Ranger | −10% dash cooldown |
| Scout | +12% movement speed |
| Heavy | +20% max HP, −8% speed |
| Operative | +10% headshot damage |
| Pyro | Burning bullets (small extra damage per hit) |
| Medic | Regenerate 0.5 HP / sec |
| Engineer | −15% reload time |
| Phantom | +15% Phantom power-up duration |

**Accounts & Progression** (powered by Convex)
- Username / password accounts via Convex Auth — no email required
- Persistent progression stored as a single compact Convex document per player (stats, skill points, achievements bitmask, **weapon mastery XP**, **equipped title**, avatar, daily progress on its own table)
- Account rank (Bronze → Master) and level driven by kills and wins, not games played
- Smart skill tree unlocked with points earned from Solo runs and Daily Challenge claims
- Achievements are Solo-only; cross-device settings sync; privacy-aware public profiles

**UI & Polish**
- Cohesive, professional dark UI built with hand-crafted Tailwind styling
- Crisp `lucide-react` SVG iconography throughout — zero emoji chrome
- Dynamic crosshair, hit markers and floating damage numbers
- Kill feed (with cosmetic title prefixes), combo display and achievement toasts
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

Spawn between waves, with a chance to drop from fallen enemies. The player can hold **one looted power at a time** — collect a crate, then press `E` to activate it.

- **Ammo Crate** — Refill your current magazine
- **Speed Boost** — Faster movement (10s)
- **Damage Boost** — Double weapon damage (15s)
- **Shield** — Deployable riot shield that absorbs front-arc damage (12s)
- **Infinite Ammo** — Unlimited ammo burst, no reloads
- **Overcharge** — Fire-rate + damage surge
- **Phantom** — Cloak: enemies can't see or hear you, and you pass through them

Plus **Killstreak Airdrops** delivered straight to you (see Killstreak Airdrops above): Rapid Fire, Invincibility, Mystery Box weapon swap, Tactical Nuke.

> By design there is **no healing** power-up — your only damage mitigation is the shield, the Medic class passive in multiplayer, the Adrenaline / Bloodletting / Vampiric Edge wave perks, and not getting hit.

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
| M | Toggle expanded tactical map |
| ESC | Pause |

### Mystery Box picker

| Key | Action |
|-----|--------|
| 1 / 2 / 3 | Highlight a box |
| ← / → or A / D | Browse |
| Enter / Space | Open the highlighted box |

The picker releases the pointer lock and blocks gameplay input so a stray click can't fire through the overlay. Multiplayer adds an 8-second auto-pick countdown.

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
| Sniper (Ranged) | 28 |
| Boss Enemy | 100 |
| Crowned Elite (Mini-Boss) | × 3 of the underlying type |
| Sentinel Destroyed | 150 |
| Combo Bonus | +5 × multiplier |

Score is then multiplied by the active **difficulty bonus** (Easy 0.6 / Medium 1.0 / Hard 1.7 / Adaptive 1.3) and the **Run Modifier** multiplier if one is active.

### Difficulty tuning
Medium and Hard were re-balanced to fit the new threat density (Snipers, Sentinels, Explosive Barrels):

| Mode | HP × | Damage × | Spawn × | Speed × |
|------|------|----------|---------|---------|
| Easy | 0.90 | 0.80 | 0.70 | 0.60 |
| Medium | **1.40** | **1.25** | **1.00** | **1.05** |
| Hard | **2.20** | **1.85** | **1.40** | **1.50** |
| Adaptive | 1.30 | 1.20 | 1.00 | 0.95 |

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
│   ├── components/          # React UI components
│   │   ├── HUD.tsx
│   │   ├── MainMenu.tsx
│   │   ├── GameOver.tsx
│   │   ├── PauseMenu.tsx
│   │   ├── MultiplayerLobby.tsx
│   │   ├── SkillTreeMenu.tsx
│   │   ├── MissionDisplay.tsx
│   │   ├── WavePerkPicker.tsx       # Mystery Box overlay
│   │   ├── RunModifierPicker.tsx    # Daily mutator picker
│   │   ├── DailyChallengeCard.tsx   # Main-menu daily card
│   │   └── ...
│   └── utils/               # Game system utilities
│       ├── AIBehaviorSystem.ts
│       ├── WeatherSystem.ts
│       ├── MultiplayerManager.ts
│       ├── SoundManager.ts
│       ├── SmartEnemyManager.ts
│       ├── WavePerkRegistry.ts       # 15 perks + mystery roll
│       ├── RunModifierSystem.ts      # 6 mutators + daily roll
│       ├── DailyChallengeRegistry.ts # 5 challenges + UTC roll
│       ├── WeaponMasterySystem.ts    # Per-weapon XP & levels
│       ├── CharacterPassiveRegistry.ts
│       ├── CosmeticTitles.ts         # Achievement → title map
│       ├── HazardSystem.ts           # Explosive barrels
│       ├── RangedSentinelSystem.ts   # Laser turrets
│       └── ...
├── convex/                  # Convex backend
│   ├── schema.ts
│   ├── playerStats.ts       # + addWeaponMasteryXp, equipTitle
│   ├── daily.ts             # Daily challenge progress / claim
│   └── ...
├── public/
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tailwind.config.js
```

---

## 📝 License

[MIT](https://github.com/suryanarayanrenjith/Forest-Survival/blob/master/LICENSE)
