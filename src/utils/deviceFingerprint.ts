/**
 * Dependency-free device fingerprinting used as the anti-multi-account signal
 * at sign-up. We emit TWO independent signals and the server caps accounts
 * against BOTH (one account per device):
 *
 *  1. Hardware fingerprint — derived purely from stable browser/GPU traits
 *     (canvas render, WebGL vendor/renderer, screen geometry, timezone, UA,
 *     CPU/memory). It carries NO random component, so it survives clearing
 *     cookies / localStorage — that's what closes the "clear storage to mint a
 *     fresh identity" bypass.
 *  2. Persistent fingerprint — a random id stashed in localStorage. It catches
 *     the reverse case (two different machines that happen to share hardware
 *     traits stay distinguishable) and adds a second axis to match on.
 *
 * This is intentionally best-effort: a determined user can spoof traits across
 * a different browser/machine. The goal is to raise the cost of mass account
 * creation, paired with server-side rate limits + the global cap — not to be an
 * absolute wall.
 */

const STORAGE_KEY = "fs_device_id";

function getOrCreatePersistentId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // Private mode / storage disabled — fall back to a volatile id.
    return `volatile-${Math.random().toString(36).slice(2)}`;
  }
}

function canvasSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 220;
    canvas.height = 40;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "no-canvas";
    ctx.textBaseline = "top";
    ctx.font = "14px 'Arial'";
    ctx.fillStyle = "#0b9d5a";
    ctx.fillRect(2, 2, 120, 20);
    ctx.fillStyle = "#f60";
    ctx.fillText("Forest-Survival✨", 4, 4);
    ctx.strokeStyle = "rgba(34,197,94,0.6)";
    ctx.beginPath();
    ctx.arc(60, 20, 14, 0, Math.PI * 2);
    ctx.stroke();
    return canvas.toDataURL();
  } catch {
    return "canvas-error";
  }
}

/**
 * GPU/driver signature. The unmasked WebGL renderer string is highly
 * discriminative across machines, which sharply reduces hardware-fingerprint
 * collisions between genuinely different devices.
 */
function webglSignature(): string {
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) return "no-webgl";
    const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
    const vendor = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL)
      : gl.getParameter(gl.VENDOR);
    const renderer = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : gl.getParameter(gl.RENDERER);
    return [
      vendor,
      renderer,
      gl.getParameter(gl.VERSION),
      gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      gl.getParameter(gl.MAX_TEXTURE_SIZE),
    ].join("~");
  } catch {
    return "webgl-error";
  }
}

/** Stable 32-bit FNV-1a hash rendered as hex. */
function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

/** Wider digest: forward + reverse hashes concatenated to cut collisions. */
function digest(input: string): string {
  return `${hashString(input)}${hashString(input.split("").reverse().join(""))}`;
}

/**
 * Stable hardware traits with NO random component — identical across reloads
 * and after clearing cookies/localStorage on the same device.
 */
function stableHardwareTraits(): string {
  const nav = typeof navigator !== "undefined" ? navigator : ({} as Navigator);
  const screenInfo =
    typeof screen !== "undefined"
      ? `${screen.width}x${screen.height}x${screen.colorDepth}`
      : "no-screen";

  return [
    canvasSignature(),
    webglSignature(),
    screenInfo,
    new Date().getTimezoneOffset(),
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
    nav.language ?? "",
    (nav.languages ?? []).join(","),
    nav.userAgent ?? "",
    nav.platform ?? "",
    nav.hardwareConcurrency ?? 0,
    (nav as Navigator & { deviceMemory?: number }).deviceMemory ?? 0,
    nav.maxTouchPoints ?? 0,
  ].join("||");
}

let cachedHardware: string | null = null;
let cachedPersistent: string | null = null;

/**
 * Primary, storage-clear-resistant device fingerprint (hardware-only).
 * Kept as the single-value entry point for backward compatibility.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (!cachedHardware) cachedHardware = `fp_${digest(stableHardwareTraits())}`;
  return cachedHardware;
}

/**
 * All independent device signals the server should cap against (deduped).
 * Index 0 is always the hardware fingerprint (used for rate-limiting too).
 */
export async function getDeviceFingerprints(): Promise<string[]> {
  const hardware = await getDeviceFingerprint();
  if (!cachedPersistent) {
    cachedPersistent = `pid_${digest(getOrCreatePersistentId())}`;
  }
  return Array.from(new Set([hardware, cachedPersistent]));
}
