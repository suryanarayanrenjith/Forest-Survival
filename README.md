<div align="center">

<img src="public/og-image.jpg" alt="Forest Survival — 3D first-person wave-survival shooter emblem" width="800" />

**A 3D first-person wave-survival shooter built entirely through AI-assisted development.**

[![Play Now](https://img.shields.io/badge/Play%20Now-forestsurvival.live-34d399?style=for-the-badge&logo=threedotjs&logoColor=white)](https://forestsurvival.live)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)
[![Wiki](https://img.shields.io/badge/Docs-Wiki-6366f1?style=for-the-badge&logo=gitbook&logoColor=white)](https://github.com/suryanarayanrenjith/Forest-Survival/wiki)
</div>

---

**Forest Survival is a free 3D first-person shooter where you survive endless waves of hostile robots across eight biome maps, playable instantly in any modern browser.** The forest has been overrun by hostile machines. Fight through **10 robot enemy archetypes** with **8 unlockable weapons**, choose from **8 character classes**, and push your score as high as you can. Features roguelike wave perks, daily challenges, mutators, persistent account progression, and P2P multiplayer — built with React, Three.js, Rapier physics, and Convex entirely through conversational AI coding.

---

## Official Trailer

https://github.com/user-attachments/assets/5e1322a1-d2c6-4cd4-b0f1-dd6922f0e5dd

---

## Weapons

Weapons unlock as your score climbs. Every weapon earns its own **Mastery XP** (L0 → L10).

| Weapon | Unlock Score | Ammo | Fire Rate |
|--------|-------------|------|-----------|
| Pistol | 0 | 12 | 300ms |
| Rifle | 100 | 30 | 150ms |
| Shotgun | 250 | 8 | 800ms |
| SMG | 450 | 40 | 165ms |
| Sniper | 700 | 5 | 1200ms |
| Minigun | 1,100 | 100 | 50ms |
| Launcher | 1,600 | 1 (auto-reloads) | 2000ms |
| Subverter | 2,200 | 4 chips | 850ms |

> **These are base scores, not the requirement.** The real threshold is the base score
> multiplied by a difficulty factor: **Easy ×1.3 · Medium ×2.5 · Hard ×3.5 · Adaptive
> ×1.2–3.4** (live, scaling with how well you are doing). On Medium the Subverter needs
> 5,500 score, not 2,200. Full table: [Weapons →](https://forestsurvival.live/weapons)

The **Subverter** is a combat hacking deck — it fires intrusion chips that turn enemies against their own kind, then burns them out in a green EMP. Bosses are immune.

---

## Characters

Eight selectable classes, each with a **signature active ability** (Q) and a mechanical passive.

| Character | Active Ability | Cooldown | Passive |
|-----------|---------------|----------|---------|
| Ranger | Dash — burst forward, bowl over enemies | 5s | −10% dash cooldown |
| Scout | Adrenaline — 1.75× movement speed (4s) | 11s | +12% movement speed |
| Heavy | Bulwark — frontal riot shield (5s) | 15s | +20% max HP, −8% speed |
| Operative | Overclock — faster fire rate, bigger damage + unlimited ammo (5s) | 15s | +10% headshot damage |
| Pyro | Firestorm — AoE shockwave scorches nearby enemies | 13s | Burning bullets |
| Medic | Field Triage — restore a small amount of HP | 14s | Regen 0.5 HP/sec |
| Engineer | Demolition — wire a nearby barrel into a remote bomb, detonate on demand | 12s | −15% reload time |
| Phantom | Cloak — vanish and phase through enemies (4s) | 15s | +15% Phantom power-up duration |

---

## Enemies

| Type | Color | Base HP | Behaviour |
|------|-------|---------|-----------|
| Normal | Crimson | 50 | Balanced aggression, closes for melee |
| Fast | Blue | 30 | Agile, dodges bullets |
| Tank | Green | 150 | Slow, heavy hitter |
| Sniper | Cyan | 40 | Kites at range, fires telegraphed energy bolts |
| Revenant | Gold | 46 | Rare apex trickster — shields, blinks, self-heals |
| Boss (Overlord) | Violet | 900 | Apex summoner — calls reinforcements, immune to Subverter |

### Tactical archetypes

Four solo-only enemies that each force a **different** response, rather than just being tougher:

| Type | Color | Base HP | Forces you to |
|------|-------|---------|---------------|
| Bulwark | Slate/cyan | 120 | **Flank.** A frontal shield eats all but 12% of anything hitting its front arc — and it turns slowly enough that getting around it actually works |
| Leaper | Orange | 42 | **React.** Crouches with a loud tell, then pounces over your cover. Wide open when it lands |
| Howler | Violet | 55 | **Prioritise.** Never really fights — it shields everything near it. Ignore it and the swarm stops dying |
| Splitter | Green | 95 | **Choose your weapon.** Bursts into three runners on death. Don't pop it in your face |

The Overlord also caps how much damage a single bullet can do to it (14% of max HP), so no build one-shots it — explosives are exempt.

Boss wave timing, enrage phases, mini-boss crowns, and environmental threats are detailed in the **[Enemies →](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Enemies)** wiki page.

---

## The World Fights Back

Terrain isn't scenery. **Lava** burns, **toxic sludge** corrodes, and **frozen ponds** are slick — and all of it hurts enemies on exactly the same terms, so kiting a pack through a lava field is a real play. Weather has teeth too: a sandstorm or blizzard genuinely hides you by cutting how far enemies can pick you out, deep snow drags, and heavy rain masks your footsteps.

Waves have **shapes**. From wave 4, roughly half of all solo waves are dealt one of four characters that change the mix, the spawn distance and the pacing — the rest stay standard so the specials keep their identity:

| Shape | What arrives | What it asks |
|-------|-------------|--------------|
| **Horde** | Half again as many, light and fast, spawning close | Back off, funnel them, keep feeding the magazine |
| **Elite** | Half as many, heavily armoured, mostly at once | Focus fire and make shots count |
| **Siege** | Sniper-heavy, at long range | Keep moving, break line of sight |
| **Ambush** | Very close, on every bearing, with no warning | Spin up fast and check behind you |

---

## ARK-07 Relay Network

Every map hides several derelict relay spires still broadcasting a dead satellite's last order. Step into a spire's radiation field and enemies overclock — hitting harder, moving faster, and self-repairing — a charge that lingers long after they walk out. The player instead gets interference-distorted vision and a jammed loadout. Waves can randomly turn **Overdrive** (an EMP-lit swarm, red-eyed and enraged) or **Null** (a corrupted, screen-glitching wave that fights unfair) — both scale with difficulty. Full mechanics are on the **[Known Features →](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Known-Features)** wiki page.

---

## Controls

| Key | Action |
|-----|--------|
| W / A / S / D | Move |
| Mouse | Look |
| Left Click | Shoot |
| Right Click | Aim (7 of 8 weapons — only the Sniper gets a true scoped takeover) |
| Space | Jump |
| Shift | Sprint |
| C | Crouch |
| Q | Active Ability |
| R | Reload |
| 1–8 / Scroll | Switch weapon |
| E | Use power-up |
| F | Inspect weapon |
| M | Tactical map |
| ESC | Pause |

All action keys (except mouse, weapon slots, and Pause) are fully rebindable — see **[Configuration →](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Configuration)**

---

## Quick Start

```bash
npm install
npm run dev   # localhost:5173
```

Full setup — Convex provisioning, auth keys, environment variables, and troubleshooting — is in the **[Installation Guide →](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Installation)**

---

## Documentation

| Wiki Page | What it covers |
|-----------|---------------|
| [Gameplay](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Gameplay) | Core loop, modes, wave shapes, boss schedule, difficulty scaling, scoring |
| [Enemies](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Enemies) | Full roster, tactical archetypes, boss mechanics and damage cap, Sentinels |
| [World](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/World) | Maps, terrain streaming, hazard pools, weather effects, day/night cycle |
| [Technical Overview](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Technical-Overview) | Stack, runtime architecture, gameplay modules, networking, data model, deployment |
| [Installation](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Installation) | Requirements, Convex setup, local dev, production build, multiplayer notes, troubleshooting |
| [Configuration](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/Configuration) | Environment variables, game settings, graphics presets, key bindings, build config |
| [FAQ](https://github.com/suryanarayanrenjith/Forest-Survival/wiki/FAQ) | Boss timing, offline play, controller support, account persistence, common questions |

---

## Acknowledgements

**[smsolutionsva-byte](https://github.com/smsolutionsva-byte)** — for generously providing the custom domain **[forestsurvival.live](https://forestsurvival.live/)** and for building the comprehensive [project Wiki](https://github.com/suryanarayanrenjith/Forest-Survival/wiki). Your support gave this project a proper home on the web and excellent documentation.

---

## License

Released under the **MIT License** — see [LICENSE](LICENSE) for the full text.
