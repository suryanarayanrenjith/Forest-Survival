// ── Hardware capability probe ────────────────────────────────────────────────
// A best-effort look at the browser/device's available power — CPU threads, RAM,
// and the GPU (via a throwaway WebGL context) — distilled into a recommended
// graphics preset. It is intentionally CONSERVATIVE: when a signal is masked or
// unknown it assumes "mid-range" and leans toward the safer (lower) tier, since
// a too-high recommendation that tanks the frame-rate is worse than a too-low
// one the player can bump up. Everything is wrapped in try/catch so a blocked
// probe never breaks startup — it just falls back to the CPU/RAM heuristic.

import type { GraphicsQuality } from './GameSettingsManager';

export interface HardwareReport {
  /** Logical CPU processors / threads (navigator.hardwareConcurrency). This is
   *  threads, NOT physical cores — the browser exposes no physical-core count. */
  threads: number;
  /** Device RAM in GB (navigator.deviceMemory; null when the browser hides it).
   *  Chrome caps the reported value at 8. */
  memoryGB: number | null;
  /** Unmasked GPU renderer string, when the browser exposes it. */
  gpu: string | null;
  /** Cleaned, human-readable GPU model (model extracted from ANGLE wrappers). */
  gpuName: string;
  isMobile: boolean;
  /** Composite capability score (roughly 0–10). */
  score: number;
  /** Recommended preset for this hardware. */
  tier: GraphicsQuality;
  /** Short human-readable summary for the settings UI. */
  summary: string;
}

// Rough GPU class from the renderer string. Range ≈ -2 (software) .. +4 (flagship).
// Matched against the FULL lowercased renderer (incl. the ANGLE wrapper) so a
// vendor+model anywhere in the string is still found. Ordered most-specific
// first so a flagship never falls through to a weaker generic bucket.
function scoreGpu(raw: string): number {
  const g = raw.toLowerCase();
  if (!g) return 1.2; // masked/unknown → assume mid-range integrated
  // Software rasterizers — effectively no GPU.
  if (/swiftshader|software|llvmpipe|microsoft basic|mesa offscreen/.test(g)) return -2;
  // ── High-end discrete ──
  if (/\brtx\s?\d{3,4}/.test(g)) return 4;                  // any GeForce RTX (20xx–50xx)
  if (/\brx\s?[5-9]\d{3}/.test(g)) return 4;                // Radeon RX 5000–9000
  if (/\barc\s?a\d{3}/.test(g)) return 3.4;                 // Intel Arc Axxx
  if (/\bgtx\s?1[0-6]\d\d/.test(g)) return 3.4;             // GTX 10xx / 16xx
  if (/apple\s?m[1-9]/.test(g) || /apple gpu/.test(g)) return 3.4; // Apple Silicon
  if (/\bgtx\s?\d{3,4}/.test(g)) return 2.6;               // older GeForce GTX
  if (/\brx\s?\d{3}\b/.test(g)) return 2.6;                // older Radeon RX 4xx/5xx
  // Generic discrete (recognised family, model unmatched).
  if (/geforce|quadro|\btitan\b|radeon|firepro/.test(g)) return 2.4;
  // ── Modern integrated ──
  if (/iris\s?xe|iris\s?plus|\barc\s?graphics|vega|uhd graphics|radeon\s?graphics/.test(g)) return 1.3;
  // ── Strong mobile ──
  if (/adreno\s?[7-9]\d\d|mali-g[789]\d|apple a1[5-9]/.test(g)) return 1.3;
  // ── Weak / old (mobile + legacy Intel HD) ──
  if (/adreno|mali|powervr|apple a\d|intel.*hd graphics/.test(g)) return 0.4;
  // Vendor name only (model hidden) — assume modest discrete/integrated.
  if (/nvidia|\bamd\b|\bati\b|\bintel\b/.test(g)) return 1.4;
  return 1; // generic / unrecognised
}

// Extract a readable GPU model from the raw renderer string. Chrome on Windows
// wraps it as "ANGLE (vendor, <model> Direct3D11 ..., backend)" — the model is
// the 2nd field, so a naive split-on-comma yields just the VENDOR ("NVIDIA").
function cleanGpuName(raw: string): string {
  if (!raw) return 'GPU hidden';
  let s = raw.trim();
  const angle = s.match(/^ANGLE\s*\(([^)]*(?:\([^)]*\)[^)]*)*)\)/i);
  if (angle) {
    const parts = angle[1].split(',').map((p) => p.trim()).filter(Boolean);
    // [vendor, renderer/model, backend] — prefer the model field.
    s = parts[1] || parts[0] || s;
  }
  s = s
    .replace(/\bDirect3D\d+.*$/i, '')        // "...Direct3D11 vs_5_0 ps_5_0"
    .replace(/\bvs_\d+_\d+.*$/i, '')
    .replace(/\b(OpenGL|Metal|Vulkan)\b.*$/i, '')
    .replace(/\/(PCIe|SSE2|PCI|Display).*$/i, '') // "GeForce RTX 3060/PCIe/SSE2"
    .replace(/\((?:R|TM|C)\)/gi, '')          // (R) (TM) (C)
    .replace(/\bCorporation\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  // Collapse a doubled leading vendor ("NVIDIA NVIDIA GeForce…").
  s = s.replace(/^(\w+)\s+\1\b/i, '$1').trim();
  return (s || 'GPU').slice(0, 46);
}

function tierFromScore(score: number, isMobile: boolean): GraphicsQuality {
  if (isMobile) {
    if (score >= 3.6) return 'medium';
    if (score >= 2.3) return 'low';
    return 'ultralow';
  }
  if (score >= 8) return 'ultra';
  if (score >= 6) return 'high';
  if (score >= 4) return 'medium';
  if (score >= 2.3) return 'low';
  return 'ultralow';
}

const TIER_LABEL: Record<GraphicsQuality, string> = {
  ultralow: 'Ultra Low', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra',
};

export function detectHardwareTier(): HardwareReport {
  const nav = navigator as Navigator & { deviceMemory?: number };
  // hardwareConcurrency = logical processors (THREADS), not physical cores —
  // the browser exposes no physical-core count, and some browsers cap/round it.
  const threads = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
    ? nav.hardwareConcurrency : 4;
  const memoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(nav.userAgent || '');

  // ── GPU probe (throwaway WebGL context) ──
  let gpu: string | null = null;
  let maxTexture = 0;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (gl) {
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) as string;
      maxTexture = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 0;
      // Free the context immediately — we only needed its capabilities.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* probe blocked — CPU/RAM heuristic still applies */ }

  // ── Composite score ──
  let score = 0;
  // CPU threads.
  score += threads >= 16 ? 3 : threads >= 12 ? 2.6 : threads >= 8 ? 2.2 : threads >= 6 ? 1.6 : threads >= 4 ? 1 : 0.2;
  // RAM (Chrome caps deviceMemory at 8; unknown → mid credit).
  score += memoryGB == null ? 1.2 : memoryGB >= 8 ? 2 : memoryGB >= 4 ? 1.1 : memoryGB >= 2 ? 0.4 : 0;
  // GPU class (dominant signal).
  score += scoreGpu(gpu || '');
  // Texture-size capability hint.
  if (maxTexture >= 16384) score += 0.8;
  else if (maxTexture >= 8192) score += 0.4;
  else if (maxTexture > 0 && maxTexture < 4096) score -= 0.8;
  // Very high-resolution / high-DPI panels need more GPU for the same tier.
  const dpr = window.devicePixelRatio || 1;
  const pixels = (window.screen?.width || 1920) * (window.screen?.height || 1080) * dpr * dpr;
  if (pixels > 8_000_000) score -= 0.6;
  // Phones/tablets: cap the ambition regardless of raw score.
  if (isMobile) score = Math.min(score, 4.2);
  // RAM ceilings (deviceMemory is coarse: …2,4,8). Even a strong GPU can't carry
  // Ultra's working set on little RAM, so cap the tier — but don't punish a good
  // GPU harder than necessary: 4GB still reaches High, only Ultra is blocked.
  if (!isMobile && memoryGB != null) {
    if (memoryGB <= 2) score = Math.min(score, 3.4);      // ≤2GB → Low/Medium max
    else if (memoryGB <= 4) score = Math.min(score, 7.6); // 4GB → High max (no Ultra)
  }

  const tier = tierFromScore(score, isMobile);
  const gpuName = cleanGpuName(gpu || '');
  const summary = `${threads}-thread CPU · ${memoryGB ? `${memoryGB}GB` : '—'} RAM · ${gpuName}${isMobile ? ' · mobile' : ''} → ${TIER_LABEL[tier]}`;

  return { threads, memoryGB, gpu, gpuName, isMobile, score, tier, summary };
}
