/**
 * Whether this browser can hand out a WebGL context right now.
 *
 * Asked on a throwaway canvas and released immediately, so the probe itself
 * never holds one of the browser's scarce context slots. Returns false on the
 * server, on GPU-less machines (a VM with Chrome's software renderer disabled),
 * on blocklisted GPUs, and when hardware acceleration is switched off — all
 * cases where a signed-in user must still get a usable background.
 */
export function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ??
      canvas.getContext("webgl")) as WebGLRenderingContext | null;
    if (!gl) return false;
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}
