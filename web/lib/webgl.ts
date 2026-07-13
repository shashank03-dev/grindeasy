/**
 * Whether this browser can hand out a WebGL context right now.
 *
 * Every name WebGL answers to is tried, not just the modern ones: some older
 * and embedded browsers only ever recognized "experimental-webgl", and refusing
 * to ask for it would drop them to the fallback background for no reason.
 *
 * Asked on a throwaway canvas and released immediately, so the probe itself
 * never holds one of the browser's scarce context slots. Returns false on the
 * server, and on the genuinely hopeless cases: a browser whose GL backend is
 * switched off at the process level (Chrome's `--use-gl=disabled`), or one whose
 * software renderer is unavailable. Nothing a page can do wins those back — the
 * caller must have a non-WebGL answer ready.
 */
const CONTEXT_NAMES = ["webgl2", "webgl", "experimental-webgl"] as const;

export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    for (const name of CONTEXT_NAMES) {
      const gl = canvas.getContext(name) as WebGLRenderingContext | null;
      if (gl) {
        gl.getExtension("WEBGL_lose_context")?.loseContext();
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
