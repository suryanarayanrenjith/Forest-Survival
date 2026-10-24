/**
 * GPU PASS PROFILER (dev tooling — inert unless `gpuProfiler.enabled`).
 *
 * Wraps render passes in EXT_disjoint_timer_query_webgl2 TIME_ELAPSED queries
 * and averages the results per label, so optimisation work is driven by
 * measured GPU milliseconds instead of guesses. Queries are polled lazily
 * (results arrive a few frames late) and never block the pipeline. Queries
 * cannot nest in WebGL, so begin/end pairs must be strictly sequential.
 *
 * When disabled every call is a single boolean check.
 */
interface PendingQuery { q: WebGLQuery; label: string }

class GpuProfiler {
  enabled = false;
  /** Odd frames skip the shadow-map update so scene cost can be split from shadow cost. */
  splitShadows = false;
  frame = 0;
  private gl: WebGL2RenderingContext | null = null;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private pending: PendingQuery[] = [];
  private free: WebGLQuery[] = [];
  private active: PendingQuery | null = null;
  private stats = new Map<string, { sum: number; n: number }>();

  attach(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as typeof this.ext;
  }

  begin(label: string) {
    if (!this.enabled || !this.gl || !this.ext || this.active) return;
    const q = this.free.pop() ?? this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = { q, label };
  }

  end() {
    if (!this.active || !this.gl || !this.ext) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Collect finished queries (call once per frame). */
  poll() {
    if (!this.enabled || !this.gl || !this.ext) return;
    this.frame++;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT);
    let i = 0;
    while (i < this.pending.length) {
      const p = this.pending[i];
      if (!gl.getQueryParameter(p.q, gl.QUERY_RESULT_AVAILABLE)) { i++; continue; }
      if (!disjoint) {
        const ns = gl.getQueryParameter(p.q, gl.QUERY_RESULT) as number;
        const s = this.stats.get(p.label) ?? { sum: 0, n: 0 };
        s.sum += ns / 1e6;
        s.n++;
        this.stats.set(p.label, s);
      }
      this.free.push(p.q);
      this.pending.splice(i, 1);
    }
  }

  reset() { this.stats.clear(); }

  report(): Record<string, number> {
    const out: Record<string, number> = {};
    this.stats.forEach((v, k) => { out[k] = +(v.sum / Math.max(1, v.n)).toFixed(3); });
    return out;
  }
}

export const gpuProfiler = new GpuProfiler();
