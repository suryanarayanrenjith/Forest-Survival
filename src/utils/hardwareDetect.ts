// ── Hardware capability probe ────────────────────────────────────────────────
// A best-effort look at the browser/device's available power — the GPU (via a
// throwaway WebGL context), CPU threads and RAM — distilled into a recommended
// graphics preset.
//
// DESIGN (rewritten 2026-06): the GPU is the PRIMARY determinant, exactly like
// real games / vendor auto-detect tools (GeForce Experience, AMD/Intel) which
// profile by GPU first and only use CPU + resolution to refine. The GPU class
// sets a CEILING tier; CPU threads, RAM and panel resolution can only pull that
// ceiling DOWN, never push it up. This fixes the old additive model where a
// strong CPU + lots of RAM could carry a machine to `high` even on an integrated
// or masked GPU (an 8-thread / 8GB laptop with Intel UHD scored 6.3 → `high`,
// the exact false-positive being fixed here).
//
// It stays intentionally CONSERVATIVE: when the GPU signal is masked/unknown it
// caps low, because a too-high recommendation that tanks the frame-rate is worse
// than a too-low one the player can bump up in one click. Everything is wrapped
// in try/catch so a blocked probe never breaks startup.

import type { GraphicsQuality } from './GameSettingsManager';

export interface HardwareReport {
  /** Logical CPU processors / threads (navigator.hardwareConcurrency). This is
   *  threads, NOT physical cores — the browser exposes no physical-core count. */
  threads: number;
  /** Device RAM in GB (navigator.deviceMemory; null when the browser hides it).
   *  Chrome caps the reported value at 8 and rounds to a power of two. */
  memoryGB: number | null;
  /** Unmasked GPU renderer string, when the browser exposes it. */
  gpu: string | null;
  /** Cleaned, human-readable GPU model (model extracted from ANGLE wrappers). */
  gpuName: string;
  isMobile: boolean;
  /** Informational composite capability estimate (roughly 0–10). NOT used to
   *  pick the tier any more — the GPU gate below does that — but handy for
   *  debugging / display. */
  score: number;
  /** Recommended preset for this hardware. */
  tier: GraphicsQuality;
  /** Short human-readable summary for the settings UI. */
  summary: string;
}

// Ordered weakest→strongest so a numeric ceiling/floor is just an index.
const TIER_ORDER: GraphicsQuality[] = ['ultralow', 'low', 'medium', 'high', 'ultra'];
const tierIndex = (t: GraphicsQuality): number => TIER_ORDER.indexOf(t);
const tierAt = (i: number): GraphicsQuality => TIER_ORDER[Math.max(0, Math.min(TIER_ORDER.length - 1, i))];
/** Clamp a tier so it never exceeds `max` (the GPU/CPU/RAM ceilings). */
const capTier = (t: GraphicsQuality, max: GraphicsQuality): GraphicsQuality => tierAt(Math.min(tierIndex(t), tierIndex(max)));
/** Step a tier down by `n` (panel-resolution demotion). */
const demoteTier = (t: GraphicsQuality, n: number): GraphicsQuality => tierAt(tierIndex(t) - n);

type GpuTier = GraphicsQuality | 'unknown';
type GpuKind = 'discrete' | 'integrated' | 'mobile' | 'software' | 'unknown';
interface GpuClassification { tier: GpuTier; kind: GpuKind; }

// Classify the GPU into the highest preset it can realistically sustain in THIS
// (heavy: post-FX + real-time shadows + instanced terrain) WebGL game. Matched
// against the FULL lowercased renderer (incl. the ANGLE wrapper) so a vendor +
// model anywhere in the string is found. Ordered MOST-SPECIFIC first, and — the
// important part for accuracy — every INTEGRATED-GPU marker is tested before the
// generic vendor fallbacks, so "AMD Radeon(TM) Graphics" (an APU) is correctly
// read as integrated rather than a discrete Radeon.
function classifyGpu(raw: string): GpuClassification {
  const g = raw.toLowerCase().trim();
  if (!g) return { tier: 'unknown', kind: 'unknown' };

  // ── Software rasterizers — effectively no GPU ──
  if (/swiftshader|software|llvmpipe|microsoft basic|mesa offscreen|\bwarp\b/.test(g)) {
    return { tier: 'ultralow', kind: 'software' };
  }

  // ── NVIDIA discrete (RTX / GTX / Titan / Quadro) ──
  if (/\brtx\s?(50|40|30)\d\d/.test(g)) return { tier: 'ultra', kind: 'discrete' }; // RTX 30/40/50 series
  if (/\btitan\b/.test(g)) return { tier: 'ultra', kind: 'discrete' };
  if (/\brtx\s?20\d\d/.test(g) || /\brtx\s?a\d{3,4}/.test(g)) return { tier: 'high', kind: 'discrete' }; // RTX 20xx / RTX Axxx pro
  if (/\bgtx\s?16\d\d/.test(g)) return { tier: 'high', kind: 'discrete' }; // GTX 1650/1660
  if (/\bgtx\s?10[6-9]\d/.test(g)) return { tier: 'high', kind: 'discrete' }; // GTX 1060/1070/1080
  if (/\bgtx\s?105\d/.test(g)) return { tier: 'medium', kind: 'discrete' }; // GTX 1050 / 1050 Ti
  if (/\bgtx\s?9\d\d/.test(g)) return { tier: 'medium', kind: 'discrete' }; // GTX 950/960/970/980
  if (/\bgtx\s?[5-8]\d\d/.test(g)) return { tier: 'low', kind: 'discrete' }; // older GTX 5xx–8xx
  if (/\brtx\b/.test(g)) return { tier: 'high', kind: 'discrete' }; // unknown RTX model
  if (/\bquadro\s?(rtx|p[5-9])/.test(g)) return { tier: 'high', kind: 'discrete' };
  if (/quadro/.test(g)) return { tier: 'medium', kind: 'discrete' };

  // ── AMD discrete (RX / Radeon Pro / Radeon VII) ──
  // NOTE: integrated Radeon APUs are caught further down; the patterns here
  // require a discrete model number so they don't swallow "Radeon Graphics".
  if (/radeon\s?vii/.test(g)) return { tier: 'ultra', kind: 'discrete' };
  if (/\brx\s?(9|7|6)\d{3}/.test(g)) return { tier: 'ultra', kind: 'discrete' }; // RX 6000/7000/9000
  if (/\brx\s?5\d{3}/.test(g)) return { tier: 'high', kind: 'discrete' }; // RX 5000
  if (/\brx\s?vega/.test(g)) return { tier: 'high', kind: 'discrete' }; // discrete Vega
  if (/\brx\s?[45]\d0\b/.test(g)) return { tier: 'medium', kind: 'discrete' }; // RX 460/470/480/560/570/580/590
  if (/radeon\s?pro\s?(vega|w|\d{3})/.test(g)) return { tier: 'high', kind: 'discrete' }; // Mac discrete Radeon Pro
  if (/radeon\s?(r9|r7)/.test(g)) return { tier: 'low', kind: 'discrete' }; // old R9/R7

  // ── Intel Arc discrete ──
  if (/\barc\s?a[57]\d\d/.test(g)) return { tier: 'high', kind: 'discrete' }; // Arc A580/A750/A770
  if (/\barc\s?a3\d\d/.test(g)) return { tier: 'medium', kind: 'discrete' }; // Arc A310/A380
  if (/\barc\s?b\d{3}/.test(g)) return { tier: 'high', kind: 'discrete' }; // Arc Battlemage

  // ── Apple Silicon ──
  if (/apple\s?m\d.*\b(max|ultra)\b/.test(g)) return { tier: 'ultra', kind: 'integrated' };
  if (/apple\s?m\d.*\bpro\b/.test(g)) return { tier: 'ultra', kind: 'integrated' };
  if (/apple\s?m\d/.test(g)) return { tier: 'high', kind: 'integrated' }; // M1/M2/M3/M4 base
  if (/apple\s?a1[5-9]/.test(g)) return { tier: 'low', kind: 'mobile' }; // recent iPhone/iPad A-series

  // ── Modern integrated (must precede generic vendor fallbacks) ──
  if (/radeon\s?(78|77|76|68|66)0m/.test(g)) return { tier: 'medium', kind: 'integrated' }; // RDNA3 iGPU (780M etc.)
  if (/\b(iris\s?xe|iris\s?plus)\b/.test(g)) return { tier: 'low', kind: 'integrated' };
  if (/\barc\s?graphics\b/.test(g)) return { tier: 'low', kind: 'integrated' }; // Meteor/Lunar Lake iGPU
  if (/\bvega\s?\d/.test(g) || /radeon\s?graphics/.test(g)) return { tier: 'low', kind: 'integrated' }; // Vega 8 / generic APU
  if (/\buhd\s?graphics\b/.test(g)) return { tier: 'low', kind: 'integrated' };
  if (/\bhd\s?graphics\b/.test(g) || /intel.*\bgma\b/.test(g)) return { tier: 'ultralow', kind: 'integrated' }; // old Intel HD

  // ── Mobile GPUs (Qualcomm / ARM / Imagination) ──
  if (/adreno\s?[78]\d\d/.test(g)) return { tier: 'low', kind: 'mobile' };
  if (/mali-g[789]\d/.test(g)) return { tier: 'low', kind: 'mobile' };
  if (/adreno|mali|powervr|apple\s?a\d/.test(g)) return { tier: 'ultralow', kind: 'mobile' };

  // ── Vendor name only (model hidden) ──
  // A bare "NVIDIA" with no model is almost always a discrete card → modest mid.
  // A bare "Intel"/"AMD" is most likely an integrated part → conservative low.
  if (/geforce|nvidia/.test(g)) return { tier: 'medium', kind: 'discrete' };
  if (/\bintel\b/.test(g)) return { tier: 'low', kind: 'integrated' };
  if (/radeon|\bamd\b|\bati\b/.test(g)) return { tier: 'low', kind: 'integrated' };

  return { tier: 'unknown', kind: 'unknown' };
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

const TIER_LABEL: Record<GraphicsQuality, string> = {
  ultralow: 'Ultra Low', low: 'Low', medium: 'Medium', high: 'High', ultra: 'Ultra',
};

// Turn the GPU class + secondary signals into a final tier. The GPU is the
// ceiling; everything else can only demote.
function recommendTier(
  gpu: GpuClassification,
  threads: number,
  memoryGB: number | null,
  isMobile: boolean,
  webgl2: boolean,
  maxTexture: number,
  cssPixels: number,
): GraphicsQuality {
  // ── Mobile: hard conservative path ──
  // Even flagship phones/tablets struggle to SUSTAIN this game's post-FX +
  // shadow load, so the ceiling is LOW; weak devices drop to ultralow.
  if (isMobile) {
    let t: GraphicsQuality = gpu.tier === 'unknown' ? 'low' : capTier(gpu.tier, 'low');
    if (gpu.kind === 'software') t = 'ultralow';
    if (threads <= 4 || (memoryGB != null && memoryGB <= 3)) t = capTier(t, 'ultralow');
    return t;
  }

  // ── Desktop ──
  let base: GraphicsQuality;
  if (gpu.tier === 'unknown') {
    // No reliable GPU signal (masked renderer / privacy mode). A strong CPU +
    // RAM hints at a real desktop, but we can NOT confirm a discrete GPU, so we
    // cap at MEDIUM and otherwise stay LOW. This is the key fix: an unknown GPU
    // can never reach High/Ultra on the strength of CPU/RAM alone.
    base = threads >= 8 && (memoryGB == null || memoryGB >= 8) ? 'medium' : 'low';
  } else {
    base = gpu.tier;
  }

  // WebGL2 missing → an old/limited GPU+driver stack regardless of name.
  if (!webgl2) base = capTier(base, 'medium');
  // Max texture size is a hard capability hint for a feeble GPU.
  if (maxTexture > 0 && maxTexture < 4096) base = capTier(base, 'ultralow');
  else if (maxTexture > 0 && maxTexture < 8192) base = capTier(base, 'low');

  // ── CPU / RAM refinement ───────────────────────────────────────────────────
  // CRITICAL: `navigator.hardwareConcurrency` and `deviceMemory` are UNRELIABLE.
  // Privacy features routinely under-report them — Firefox `resistFingerprinting`
  // and the Tor Browser pin hardwareConcurrency to 2 and hide deviceMemory;
  // Brave/others cap or quantise both. So a strong DISCRETE GPU reading
  // "2 threads / 4 GB" is almost always SPOOFING, not a real dual-core, and the
  // GPU model is the far more trustworthy signal of a capable rig. We therefore
  // only let low CPU/RAM CRATER the tier for integrated / unknown / software
  // GPUs; a discrete card keeps the tier its model earned — so a GTX/RTX is never
  // mis-detected as Low just because the browser hid the core count. (A genuinely
  // thin machine wouldn't be carrying a discrete GPU in the first place.)
  if (gpu.kind !== 'discrete') {
    // RAM ceilings (deviceMemory is coarse — …2,4,8 — null when hidden → no penalty).
    if (memoryGB != null) {
      if (memoryGB <= 2) base = capTier(base, 'low');
      else if (memoryGB <= 4) base = capTier(base, 'high'); // 4GB can't carry Ultra's working set
    }
    // CPU-thread ceilings — a thin CPU can't feed the renderer + AI + physics for
    // the top tiers when the GPU isn't a discrete card pulling the weight.
    if (threads <= 2) base = capTier(base, 'low');
    else if (threads <= 3) base = capTier(base, 'medium');
    else if (threads <= 4) base = capTier(base, 'high'); // block Ultra on a true quad
  }

  // Large panels (4K-class CSS resolution) cost more GPU per tier. The game
  // renders at innerWidth×pixelRatio (CSS px, setPixelRatio(1)), so the workload
  // proxy is the CSS resolution, NOT physical pixels. A flagship (ultra-class)
  // GPU is left alone — it's expected to drive 4K — everyone else steps down one.
  if (cssPixels >= 8_000_000 && base !== 'ultra') base = demoteTier(base, 1);

  return base;
}

// Informational only (the tier is GPU-gated above). A rough 0–10 capability
// estimate kept for debugging / potential display.
function estimateScore(gpu: GpuClassification, threads: number, memoryGB: number | null): number {
  const gpuScore = gpu.tier === 'unknown' ? 2 : tierIndex(gpu.tier) * 2; // 0–8
  const cpuScore = threads >= 16 ? 1 : threads >= 8 ? 0.7 : threads >= 4 ? 0.4 : 0.1;
  const ramScore = memoryGB == null ? 0.5 : memoryGB >= 8 ? 1 : memoryGB >= 4 ? 0.5 : 0.2;
  return Math.min(10, Math.round((gpuScore + cpuScore + ramScore) * 10) / 10);
}

export function detectHardwareTier(): HardwareReport {
  const nav = navigator as Navigator & { deviceMemory?: number };
  // hardwareConcurrency = logical processors (THREADS), not physical cores —
  // the browser exposes no physical-core count, and some browsers cap/round it.
  const threads = typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0
    ? nav.hardwareConcurrency : 4;
  const memoryGB = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null;
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle|BlackBerry|Opera Mini|IEMobile/i.test(nav.userAgent || '')
    // iPadOS 13+ reports a desktop Safari UA but is multi-touch + has no hover;
    // catch it so high-DPI tablets don't fall into the desktop path.
    || (/Macintosh/.test(nav.userAgent || '') && typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 1);

  // ── GPU probe (throwaway WebGL context) ──
  let gpu: string | null = null;
  let maxTexture = 0;
  let webgl2 = false;
  let contextOk = false;
  try {
    const canvas = document.createElement('canvas');
    const gl2 = canvas.getContext('webgl2');
    const gl = (gl2 || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    webgl2 = !!gl2;
    if (gl) {
      contextOk = true;
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) as string;
      maxTexture = (gl.getParameter(gl.MAX_TEXTURE_SIZE) as number) || 0;
      // Free the context immediately — we only needed its capabilities.
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch { /* probe blocked — CPU/RAM heuristic still applies */ }

  // No WebGL context at all → the machine can barely render; floor it.
  const gpuClass: GpuClassification = contextOk
    ? classifyGpu(gpu || '')
    : { tier: 'ultralow', kind: 'software' };

  const dpr = window.devicePixelRatio || 1;
  // CSS-pixel workload proxy (the renderer uses innerWidth, NOT physical px).
  const cssW = window.innerWidth || (window.screen?.width || 1920);
  const cssH = window.innerHeight || (window.screen?.height || 1080);
  const cssPixels = cssW * cssH;

  const tier = recommendTier(gpuClass, threads, memoryGB, isMobile, webgl2, maxTexture, cssPixels);
  const score = estimateScore(gpuClass, threads, memoryGB);
  const gpuName = cleanGpuName(gpu || '');
  // Annotate the summary when the GPU couldn't be identified so the player
  // understands why a capable-feeling machine was capped conservatively.
  const gpuNote = gpuClass.tier === 'unknown' ? ' (GPU hidden)'
    : gpuClass.kind === 'integrated' ? ' (integrated)'
    : '';
  void dpr; // (kept for potential future tuning; CSS px drives the workload)
  const summary = `${threads}-thread CPU · ${memoryGB ? `${memoryGB}GB` : '—'} RAM · ${gpuName}${gpuNote}${isMobile ? ' · mobile' : ''} → ${TIER_LABEL[tier]}`;

  return { threads, memoryGB, gpu, gpuName, isMobile, score, tier, summary };
}
