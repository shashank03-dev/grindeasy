"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Mesh, Program, Renderer, Triangle } from "ogl";
import { hasWebGL } from "@/lib/webgl";

// The site's one image. A single fixed canvas behind everything: an object,
// ray-marched at a fraction of screen resolution and printed through an 8×8
// ordered (Bayer) dither in two tones, then scaled up with nearest-neighbour
// so each dither cell is a crisp 3px square. It is the screen the type is
// drawn on, not decoration laid over it.
//
// The object morphs between six signed-distance shapes, one per chapter of
// the story (see SHAPES below). Scroll choreography lives in the pages: they
// write targets into `field` and the render loop eases toward them every
// frame, so GSAP never touches WebGL and React never re-renders for motion.

export const SHAPES = {
  /** A living sphere, breathing under noise — the agent, idle. */
  core: 0,
  /** A tilted ring — the clock face it reads. */
  ring: 1,
  /** A twisted bar — the scanner sweeping session folders. */
  scan: 2,
  /** A thin rounded slab — a profile card, seen edge-on. */
  card: 3,
  /** An octahedron — the tier ladder tops out at Diamond. */
  diamond: 4,
  /** A sphere carved into a gyroid cage — data that stays inside. */
  cage: 5,
} as const;

type RGB = [number, number, number];

export interface FieldTargets {
  shape: number;
  /** Object centre, in units of viewport height from screen centre. */
  x: number;
  y: number;
  scale: number;
  /** Two-tone print color, linear 0–1 RGB. */
  tint: RGB;
  /** Motion and surface agitation, 0–1. */
  energy: number;
  /** Dissolve-in, 0 = blank ink, 1 = fully printed. */
  reveal: number;
  /** Extra rotation in radians, usually driven by scroll. */
  spin: number;
}

export const field: FieldTargets = {
  shape: SHAPES.core,
  x: 0.42,
  y: 0.02,
  scale: 1,
  tint: [0.925, 0.92, 0.894],
  energy: 0.6,
  reveal: 0,
  spin: 0,
};

/** Merge targets; the render loop eases toward them. */
export function setField(next: Partial<FieldTargets>) {
  Object.assign(field, next);
}

export const hexToRgb = (hex: string): RGB => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

// Ink, duplicated from --ink in globals.css.
const INK: RGB = [0.031, 0.035, 0.039];

/** CSS pixels per dither cell. */
const CELL = 3;

const vertex = /* glsl */ `
  attribute vec2 position;
  void main() { gl_Position = vec4(position, 0.0, 1.0); }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform vec2 uRes;
  uniform float uTime;
  uniform vec2 uMouse;
  uniform float uShape;
  uniform vec3 uPos;      // x, y, scale
  uniform vec3 uTint;
  uniform vec3 uInk;
  uniform float uEnergy;
  uniform float uReveal;
  uniform float uSpin;
  uniform float uVel;

  // Ordered dither threshold, 8×8 Bayer built from the 2×2 recurrence (WebGL1
  // has no integer bit ops, and this needs no lookup texture).
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

  mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

  float sdSphere(vec3 p, float r) { return length(p) - r; }
  float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
  float sdRoundBox(vec3 p, vec3 b, float r) {
    vec3 q = abs(p) - b + r;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r;
  }
  float sdOcta(vec3 p, float s) { p = abs(p); return (p.x + p.y + p.z - s) * 0.57735027; }

  float shapeSDF(float id, vec3 p) {
    float t = uTime;
    if (id < 0.5) {
      // core: sphere with a slow three-axis interference ripple
      float d = sin(p.x * 3.1 + t * 0.9) * sin(p.y * 2.7 + t * 1.1) * sin(p.z * 3.3 + t * 0.7);
      return sdSphere(p, 1.0) + d * (0.06 + 0.1 * uEnergy);
    }
    if (id < 1.5) {
      // ring: the dial, tilted toward the viewer
      vec3 q = p; q.yz *= rot(1.05);
      return sdTorus(q, vec2(1.05, 0.2 + 0.03 * sin(atan(q.z, q.x) * 12.0 + t * 2.0)));
    }
    if (id < 2.5) {
      // scan: a long bar, twisted along its length
      vec3 q = p; q.xz *= rot(p.y * 1.4 + t * 0.4);
      return sdRoundBox(q, vec3(0.34, 1.25, 0.34), 0.08);
    }
    if (id < 3.5) {
      // card: thin slab
      return sdRoundBox(p, vec3(1.25, 0.78, 0.07), 0.07);
    }
    if (id < 4.5) {
      return sdOcta(p, 1.25);
    }
    // cage: sphere shell carved by a gyroid
    vec3 q = p * 4.2;
    float g = abs(dot(sin(q), cos(q.yzx))) / 4.2 - 0.04;
    return max(abs(sdSphere(p, 1.0)) - 0.1, g);
  }

  float map(vec3 p) {
    p /= uPos.z;
    p.xz *= rot(uTime * (0.12 + 0.25 * uEnergy) + uSpin + uMouse.x * 0.6);
    p.yz *= rot(0.25 + uMouse.y * 0.45);
    float a = floor(uShape);
    float f = smoothstep(0.0, 1.0, fract(uShape));
    float d = mix(shapeSDF(a, p), shapeSDF(min(a + 1.0, 5.0), p), f);
    return d * uPos.z * 0.8;
  }

  vec3 normal(vec3 p) {
    vec2 e = vec2(0.0015, -0.0015);
    return normalize(
      e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
      e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx)
    );
  }

  void main() {
    vec2 frag = gl_FragCoord.xy;
    vec2 uv = (frag - 0.5 * uRes) / uRes.y;

    // Scroll velocity tears the image into horizontal bands, like a CRT
    // losing sync. Quantised so the tear lands on whole dither rows.
    float band = floor(frag.y / 6.0);
    uv.x += (fract(sin(band * 91.7) * 4375.5) - 0.5) * uVel * 0.06;

    vec3 ro = vec3(0.0, 0.0, 4.2);
    vec3 rd = normalize(vec3(uv - uPos.xy, -1.9));

    float t = 0.0;
    float minD = 1e3;
    bool hit = false;
    for (int i = 0; i < 64; i++) {
      vec3 p = ro + rd * t;
      float d = map(p);
      minD = min(minD, d);
      if (d < 0.002) { hit = true; break; }
      t += d;
      if (t > 9.0) break;
    }

    float lum;
    if (hit) {
      vec3 p = ro + rd * t;
      vec3 n = normal(p);
      vec3 l = normalize(vec3(-0.6 + uMouse.x * 0.8, 0.75 + uMouse.y * 0.4, 0.7));
      float diff = max(dot(n, l), 0.0);
      float rim = pow(1.0 - max(dot(n, -rd), 0.0), 2.5);
      float spec = pow(max(dot(reflect(-l, n), -rd), 0.0), 24.0);
      lum = 0.02 + diff * 0.58 + rim * 0.42 + spec * 0.65;
    } else {
      // Halo: the closest the ray came to the surface, so the object glows
      // into the ink in dither rather than ending at a hard silhouette.
      lum = exp(-minD * 12.0) * 0.22;
    }

    // Offset by half a step: the matrix holds an exact 0, and step(0, lum)
    // would light that cell everywhere, printing a dot grid over the ink.
    float threshold = bayer8(frag) + 0.5 / 64.0;
    float on = step(threshold, lum);
    // Highlights burn through to paper white — a third tone for free.
    float burn = step(threshold * 0.5 + 0.92, lum);
    vec3 col = mix(uInk, uTint, on);
    col = mix(col, vec3(0.97, 0.965, 0.94), burn);

    // Dissolve: cells switch on in Bayer order as reveal climbs.
    float shown = step(bayer8(frag + 3.0) + 0.5 / 64.0, uReveal);
    gl_FragColor = vec4(mix(uInk, col, shown), 1.0);
  }
`;

interface Props {
  className?: string;
  /** Initial targets, applied on mount and snapped to (no ease-in). */
  initial?: Partial<FieldTargets>;
}

export function DitherField({ className, initial }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);
  // Read once: callers pass a literal, and re-running the GL setup when its
  // identity changes would tear the context down every render.
  const initialRef = useRef(initial);

  // Seed the targets in a layout effect: a child's layout effects run before
  // its parent's, so the page's own setup always writes after this, never
  // under it. (Seeding in the GL effect below raced the landing's boot and
  // could reset a finished reveal back to blank.)
  useLayoutEffect(() => {
    if (initialRef.current) setField(initialRef.current);
  }, []);

  useEffect(() => {
    const el = host.current;
    if (!el || !hasWebGL()) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        dpr: 1 / CELL,
        alpha: false,
        antialias: false,
        depth: false,
        powerPreference: "low-power",
      });
    } catch {
      return;
    }
    const gl = renderer.gl;
    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.imageRendering = "pixelated";
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    gl.clearColor(INK[0], INK[1], INK[2], 1);
    el.appendChild(canvas);

    // Current (eased) state. Starts at the targets so nothing flies in.
    const cur = { ...field, tint: [...field.tint] as RGB };

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uRes: { value: [1, 1] },
        uTime: { value: 0 },
        uMouse: { value: [0, 0] },
        uShape: { value: cur.shape },
        uPos: { value: [cur.x, cur.y, cur.scale] },
        uTint: { value: cur.tint },
        uInk: { value: INK },
        uEnergy: { value: cur.energy },
        uReveal: { value: cur.reveal },
        uSpin: { value: cur.spin },
        uVel: { value: 0 },
      },
    });
    const mesh = new Mesh(gl, { geometry: new Triangle(gl), program });

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      program.uniforms.uRes.value = [gl.drawingBufferWidth, gl.drawingBufferHeight];
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const onMove = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    if (!reduced) window.addEventListener("pointermove", onMove, { passive: true });

    // Scroll velocity, measured here so every page gets the tear for free.
    let lastY = window.scrollY;
    let vel = 0;

    let raf = 0;
    let last = performance.now();
    let time = 0;
    let lost = false;
    let drawnKey = "";

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (lost) return;
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;

      const k = reduced ? 1 : 1 - Math.exp(-dt * 3.2);
      cur.shape += (field.shape - cur.shape) * k;
      cur.x += (field.x - cur.x) * k;
      cur.y += (field.y - cur.y) * k;
      cur.scale += (field.scale - cur.scale) * k;
      cur.energy += (field.energy - cur.energy) * k;
      cur.spin += (field.spin - cur.spin) * (reduced ? 1 : 1 - Math.exp(-dt * 6));
      cur.reveal += (field.reveal - cur.reveal) * (reduced ? 1 : 1 - Math.exp(-dt * 4.5));
      for (let i = 0; i < 3; i++) cur.tint[i]! += (field.tint[i]! - cur.tint[i]!) * k;

      if (reduced) {
        // Still frames only: redraw when a target actually moved.
        const key = JSON.stringify(cur);
        if (key === drawnKey) return;
        drawnKey = key;
      } else {
        time += dt * (0.55 + cur.energy * 0.8);
        mouse.x += (mouse.tx - mouse.x) * (1 - Math.exp(-dt * 2.5));
        mouse.y += (mouse.ty - mouse.y) * (1 - Math.exp(-dt * 2.5));
        const y = window.scrollY;
        const v = Math.min(Math.abs(y - lastY) / Math.max(dt, 1e-3) / 4000, 1);
        lastY = y;
        vel += (v - vel) * (1 - Math.exp(-dt * 8));
      }

      const u = program.uniforms;
      u.uTime.value = time;
      u.uMouse.value = [mouse.x, mouse.y];
      u.uShape.value = cur.shape;
      u.uPos.value = [cur.x, cur.y, cur.scale];
      u.uTint.value = cur.tint;
      u.uEnergy.value = cur.energy;
      u.uReveal.value = cur.reveal;
      u.uSpin.value = cur.spin;
      u.uVel.value = vel;
      renderer.render({ scene: mesh });
    };
    raf = requestAnimationFrame(frame);
    setLive(true);

    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
      setLive(false);
    };
    const onRestored = () => {
      // OGL caches programs per context; the simplest correct recovery is to
      // keep the static fallback until the next navigation.
      lost = true;
    };
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      canvas.remove();
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden
      className={className ?? "pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink"}
    >
      {live ? null : <div className="dither-fallback absolute inset-0 opacity-60" />}
    </div>
  );
}
