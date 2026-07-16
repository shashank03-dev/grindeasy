"use client";

import { useEffect, useRef, useState } from "react";
import { Geometry, Mesh, Program, Renderer, Texture, Triangle } from "ogl";
import { hasWebGL } from "@/lib/webgl";
import { TOOL_MARKS } from "./tool-data";

// The landing's single WebGL surface: one fixed canvas behind all content,
// drawn in three passes each frame —
//   1. background: slow flowing noise + film grain + a light pool on the cursor
//   2. hero particles: the hero photograph as a point field that repels around
//      the cursor, then streams out and re-forms into the first tool's mark
//   3. metal marks: each tool's mark as a textured plane tracking its DOM
//      anchor, lit by a sweep that advances as the anchor crosses the viewport
//
// Continuous values live in uniforms and this module-level state object, never
// React state: GSAP (in landing.tsx) writes stageState, the render loop reads
// it. The scaffolding — hasWebGL pre-check, context-loss rebuild, explicit
// loseContext on teardown — follows components/particles/particles.tsx.
//
// When the stage is live it sets `data-landing-gl="on"` on <html>; CSS uses
// that to hide the static fallbacks (hero <img>, CSS-gradient marks). No
// WebGL, reduced motion, or a lost context that never comes back → the
// attribute stays off and the page runs entirely on the fallbacks.

export const stageState = {
  /** 0 = hero image intact, 1 = particles re-formed as the first tool mark. */
  morph: 0,
  /** Fallback particle opacity, used only until the seam anchor exists — once
   *  marks are built the crossfade is driven by the anchor's own position. */
  heroAlpha: 1,
};

const MAX_PARTICLES = 40000;
const MARK_TEX = 256;

// Theme colors, duplicated from the [data-landing] scope as plain RGB. Reading
// them from CSS would mean converting oklch at runtime; the theme is ours, so
// the two definitions are kept in step by hand.
const BG_RGB: [number, number, number] = [0.04, 0.052, 0.085];
const LIGHT_RGB: [number, number, number] = [0.58, 0.76, 0.9];
// The ember accent (--ember), the warm half of the grade.
const EMBER_RGB: [number, number, number] = [0.94, 0.56, 0.24];

/* ── Shaders ─────────────────────────────────────────────────────────────── */

const bgVertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
  }
`;

const bgFragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform vec2 uMouse;   // clip space
  uniform float uAspect;
  uniform vec3 uBg;
  uniform vec3 uTint;
  uniform vec3 uEmber;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(17.3, 9.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = vec2(vUv.x * uAspect, vUv.y);

    // Slow molten drift: two fbm reads folded into each other.
    float n = fbm(p * 2.2 + vec2(uTime * 0.016, -uTime * 0.011));
    n = fbm(p * 2.6 + n * 0.9 + vec2(-uTime * 0.008, uTime * 0.013));

    vec3 col = uBg * (0.78 + 0.55 * n);

    // Split-tone grade: the troughs of the noise sink toward cold teal, the
    // crests pick up a breath of the ember — cinema shadows, not a grey fog.
    col += vec3(0.008, 0.016, 0.034) * (1.0 - n);
    col += uEmber * 0.02 * pow(n, 2.4);

    // The spotlight: a soft pool that follows the cursor, brighter where the
    // noise happens to fold — light on a textured surface, not a flat radial.
    vec2 m = vec2(uMouse.x * uAspect, uMouse.y) * 0.5 + vec2(uAspect * 0.5, 0.5);
    float d = length(p - m);
    float pool = exp(-d * d * 5.5);
    col += uTint * pool * (0.06 + 0.09 * n);

    // A faint fixed glow at the top center, echoing the photo's overhead lamp
    // — warmed slightly, the way the lamp actually reads in the photograph.
    float lamp = exp(-length((p - vec2(uAspect * 0.5, 1.05)) * vec2(1.0, 1.6)) * 2.2);
    col += mix(uTint, uEmber, 0.35) * lamp * 0.05;

    // Film grain, per-pixel per-frame.
    col += (hash(vUv * vec2(1621.0, 917.0) + fract(uTime)) - 0.5) * 0.055;

    gl_FragColor = vec4(col, 1.0);
  }
`;

const particleVertex = /* glsl */ `
  attribute vec2 aStart;    // normalized image space, -0.5..0.5, y up
  attribute vec2 aTarget;   // normalized mark space, -0.5..0.5, y up
  attribute vec3 aColor;
  attribute vec4 aRand;

  uniform float uTime;
  uniform float uMorph;
  uniform float uAlpha;
  uniform float uDpr;
  uniform vec2 uImgScale;   // image rect in clip units (cover fit)
  uniform vec2 uMarkScale;  // mark box in clip units
  uniform vec2 uMarkPos;    // mark box center, clip space — glides onto the seam anchor
  uniform vec2 uMouse;      // clip space
  uniform float uAspect;
  uniform vec3 uMarkTint;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    // Staggered morph: each particle leaves on its own slot, so the image
    // dissolves as a stream rather than one synchronized jump.
    const float STAGGER = 1.1;
    float prog = clamp(uMorph * (1.0 + STAGGER) - aRand.x * STAGGER, 0.0, 1.0);
    float e = prog * prog * (3.0 - 2.0 * prog);

    vec2 from = aStart * uImgScale;
    vec2 to = aTarget * uMarkScale + uMarkPos;
    vec2 pos = mix(from, to, e);

    // Mid-flight scatter: an arc perpendicular to the travel direction plus a
    // per-particle wobble, gone on arrival — the swarm streams, not slides.
    float flight = sin(3.14159 * e);
    vec2 dir = to - from;
    vec2 perp = normalize(vec2(-dir.y, dir.x) + 0.0001);
    pos += perp * (aRand.y - 0.5) * 0.55 * flight;
    pos += vec2(
      sin(uTime * (0.5 + aRand.z) + aRand.w * 6.28),
      cos(uTime * (0.4 + aRand.w) + aRand.z * 6.28)
    ) * 0.012 * flight;

    // Idle breathing while the image is intact.
    pos += vec2(
      sin(uTime * 0.35 + aRand.w * 6.28),
      cos(uTime * 0.3 + aRand.y * 6.28)
    ) * 0.0035 * (1.0 - e);

    // Cursor repulsion, aspect-corrected so the hole is round. Strongest at
    // rest, still faintly alive while the mark holds.
    vec2 ac = vec2(uAspect, 1.0);
    vec2 dm = (pos - uMouse) * ac;
    float dist = length(dm);
    float repel = exp(-dist * dist * 26.0) * mix(0.12, 0.03, e);
    pos += (dm / max(dist, 0.001)) * repel / ac;

    // The photo's tones are dark by design; lift them so the field reads
    // against the near-black background — graded cool, blue lifted hardest,
    // to sit inside the page's teal-and-ember look.
    vColor = mix(aColor * vec3(1.3, 1.36, 1.5), uMarkTint * (0.85 + 0.5 * aRand.z), e * 0.9);
    vColor *= 1.0 + 0.9 * flight;
    vAlpha = uAlpha * mix(0.9, 1.0, aRand.w);

    gl_Position = vec4(pos, 0.0, 1.0);
    gl_PointSize = uDpr * (1.8 + 1.5 * aRand.y) * (1.0 + 0.5 * flight);
  }
`;

const particleFragment = /* glsl */ `
  precision highp float;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float d = length(gl_PointCoord.xy - vec2(0.5));
    float circle = smoothstep(0.5, 0.2, d);
    if (circle <= 0.0) discard;
    gl_FragColor = vec4(vColor, circle * vAlpha);
  }
`;

const markVertex = /* glsl */ `
  attribute vec2 uv;
  attribute vec2 position;

  uniform vec2 uPos;    // center, clip space
  uniform vec2 uSize;   // width/height, clip units

  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position * uSize + uPos, 0.0, 1.0);
  }
`;

const markFragment = /* glsl */ `
  precision highp float;

  uniform sampler2D tMap;
  uniform float uSweep;   // 0 entering below → 1 leaving above
  uniform float uAlpha;
  uniform float uTime;
  uniform vec3 uTint;

  varying vec2 vUv;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
      f.y
    );
  }

  void main() {
    float a = texture2D(tMap, vUv).a;
    if (a < 0.004) discard;

    // Pseudo-normal from the mask's alpha gradient: edges get bevels, flats
    // stay flat. This is what makes it read as struck metal, not a flat fill.
    vec2 px = vec2(1.5 / ${MARK_TEX}.0);
    float gx = texture2D(tMap, vUv + vec2(px.x, 0.0)).a - texture2D(tMap, vUv - vec2(px.x, 0.0)).a;
    float gy = texture2D(tMap, vUv + vec2(0.0, px.y)).a - texture2D(tMap, vUv - vec2(0.0, px.y)).a;
    vec3 n = normalize(vec3(-gx * 2.4, -gy * 2.4, 1.0));

    // Living surface: a slow current and a fine horizontal brush drift across
    // the face and perturb the normal, so the flats shimmer like drawn metal
    // instead of holding one dead value.
    float flow = noise(vUv * 3.5 + vec2(uTime * 0.05, -uTime * 0.035));
    float brush = noise(vec2(vUv.x * 2.5 + uTime * 0.04, vUv.y * 26.0));
    n.xy += vec2(flow - 0.5, brush - 0.5) * 0.32;
    n = normalize(n);

    // Studio setup, three lights. The key orbits as the mark travels the
    // viewport — scroll IS the light. A cold rim holds the upper left, a low
    // ember bounce warms the underside: the same teal-and-ember grade as the
    // rest of the page, landing on the metal.
    float ang = mix(-0.9, 3.8, uSweep);
    vec3 key = normalize(vec3(cos(ang), sin(ang), 0.7));
    float diff = max(dot(n, key), 0.0);
    float spec = pow(max(dot(reflect(-key, n), vec3(0.0, 0.0, 1.0)), 0.0), 34.0);

    vec3 rimL = normalize(vec3(-0.55, 0.75, 0.42));
    float rim = pow(max(dot(n, rimL), 0.0), 2.0);

    vec3 warmL = normalize(vec3(0.3, -0.8, 0.5));
    float warm = max(dot(n, warmL), 0.0);

    const vec3 ICE = vec3(0.58, 0.76, 0.9);
    const vec3 EMBER = vec3(0.94, 0.56, 0.24);

    vec3 col = uTint * (0.17 + 0.66 * diff);
    col += ICE * rim * 0.17;
    col += EMBER * warm * 0.1;
    col *= 0.84 + 0.32 * vUv.y; // top-lit vertical shade

    // Sheen carried by the flow — the "oil on steel" life. A warm↔cool
    // seesaw (red up / blue down and back) on the page's ember↔ice axis:
    // green never moves, so no phase of the shine can drift green.
    float sheen = cos(6.2832 * (flow * 0.85 + vUv.x * 0.4));
    col *= 1.0 + sheen * vec3(0.1, 0.0, -0.1);

    // A specular band that wipes across the face with the same progress,
    // cooled toward the ice light so it reads as the studio's soft box.
    float band = smoothstep(0.32, 0.0, abs(vUv.x + vUv.y - mix(-0.5, 2.5, uSweep)));
    col += mix(vec3(1.0), ICE, 0.35) * band * 0.3 + vec3(1.0) * spec * 0.9;

    // Metal grain.
    col += (hash(vUv * 419.0) - 0.5) * 0.06;

    gl_FragColor = vec4(col, a * uAlpha);
  }
`;

/* ── Raster helpers ──────────────────────────────────────────────────────── */

// Rasterize a tool mark to a white-on-transparent canvas: either its
// simple-icons path, or the crafted tile — three-letter code in the caps face
// inside a hairline ring — for tools without a usable mark.
function rasterizeMark(
  tool: (typeof TOOL_MARKS)[number],
  capsFamily: string,
): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = MARK_TEX;
  canvas.height = MARK_TEX;
  const c = canvas.getContext("2d");
  if (!c) return null;
  c.fillStyle = "#fff";
  c.strokeStyle = "#fff";

  if (tool.path) {
    // 24×24 viewBox → centered with an 18% margin.
    const scale = (MARK_TEX * 0.64) / 24;
    c.translate(MARK_TEX * 0.18, MARK_TEX * 0.18);
    c.scale(scale, scale);
    c.fill(new Path2D(tool.path));
    return canvas;
  }

  // Bare letters, no ring — on the wheel the tiles overlap, and overlapping
  // rings read as stray empty boxes (same reason the DOM fallback is bare).
  c.font = `900 ${MARK_TEX * 0.36}px ${capsFamily}`;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText(tool.code ?? "?", MARK_TEX / 2, MARK_TEX * 0.53);
  return canvas;
}

// Sample the filled pixels of a mark raster into normalized (-0.5..0.5, y-up)
// coordinates — the morph targets the particles fly to.
function sampleMarkTargets(canvas: HTMLCanvasElement): Array<[number, number]> {
  const c = canvas.getContext("2d");
  if (!c) return [[0, 0]];
  const data = c.getImageData(0, 0, canvas.width, canvas.height).data;
  const points: Array<[number, number]> = [];
  for (let y = 0; y < canvas.height; y += 2) {
    for (let x = 0; x < canvas.width; x += 2) {
      if (data[(y * canvas.width + x) * 4 + 3]! > 128) {
        points.push([x / canvas.width - 0.5, 0.5 - y / canvas.height]);
      }
    }
  }
  return points.length > 0 ? points : [[0, 0]];
}

/* ── Component ───────────────────────────────────────────────────────────── */

export function LandingStage() {
  const containerRef = useRef<HTMLDivElement>(null);

  // Context loss recovery, as in particles.tsx: a lost context stays dead, so
  // bump generation to tear the scene down and build a fresh one.
  const [generation, setGeneration] = useState(0);
  const rebuildsRef = useRef(0);
  const REBUILD_LIMIT = 4;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // Reduced motion still gets the living background texture — it's a slow
    // light field, not a vestibular hazard, and the owner wants the texture on
    // every path. What that path skips is the particle hero and the WebGL
    // marks (neither builds, so data-landing-gl never flips and the static
    // fallbacks stay the page).
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const retryLater = () => {
      if (generation === 0 || rebuildsRef.current >= REBUILD_LIMIT) return;
      const attempt = ++rebuildsRef.current;
      const timer = window.setTimeout(() => setGeneration((g) => g + 1), 300 * attempt);
      return () => window.clearTimeout(timer);
    };

    if (!hasWebGL()) return retryLater();

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        dpr: Math.min(window.devicePixelRatio || 1, 1.25),
        alpha: false,
        depth: false,
        antialias: false,
      });
    } catch {
      return retryLater();
    }
    rebuildsRef.current = 0;

    const gl = renderer.gl;
    container.appendChild(gl.canvas);
    gl.clearColor(BG_RGB[0], BG_RGB[1], BG_RGB[2], 1);

    let lostTimer = 0;
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      delete document.documentElement.dataset.landingGl;
      lostTimer = window.setTimeout(() => setGeneration((g) => g + 1), 200);
    };
    gl.canvas.addEventListener("webglcontextlost", handleContextLost);

    let cancelled = false;

    /* Background pass — alive immediately, before any asset loads. */
    const bgProgram = new Program(gl, {
      vertex: bgVertex,
      fragment: bgFragment,
      uniforms: {
        uTime: { value: 0 },
        uMouse: { value: [0, 0] },
        uAspect: { value: 1 },
        uBg: { value: BG_RGB },
        uTint: { value: LIGHT_RGB },
        uEmber: { value: EMBER_RGB },
      },
    });
    const bgMesh = new Mesh(gl, { geometry: new Triangle(gl), program: bgProgram });

    /* Hero particles — built once the sampling image arrives. */
    let particleMesh: Mesh | null = null;
    let particleProgram: Program | null = null;

    /* Metal marks — built once fonts are in (the crafted tiles need them). */
    type MarkPass = { el: HTMLElement; idx: number; mesh: Mesh; program: Program };
    let markPasses: MarkPass[] = [];
    let seamEl: HTMLElement | null = null;
    let wheelStageEl: HTMLElement | null = null;

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const handleMouseMove = (e: MouseEvent) => {
      mouse.tx = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.ty = -((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Sizing. The image rect (cover fit) and mark box (centered square) are
    // recomputed in clip units on every resize.
    const IMG_W = 1600;
    const IMG_H = 900;
    const size = { w: 1, h: 1, imgScale: [2, 2], markScale: [1, 1] };
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      size.w = w;
      size.h = h;
      renderer.setSize(w, h);
      bgProgram.uniforms.uAspect.value = w / h;
      const cover = Math.max(w / IMG_W, h / IMG_H);
      size.imgScale = [((IMG_W * cover) / w) * 2, ((IMG_H * cover) / h) * 2];
      // Matches the seam anchor's CSS size (w-[min(50vmin,320px)]) so the
      // particle-borne mark and the metal one are the same object at handoff.
      const box = Math.min(Math.min(w, h) * 0.5, 320);
      size.markScale = [(box / w) * 2, (box / h) * 2];
      if (particleProgram) {
        particleProgram.uniforms.uImgScale.value = size.imgScale;
        particleProgram.uniforms.uMarkScale.value = size.markScale;
        particleProgram.uniforms.uAspect.value = w / h;
      }
    };
    window.addEventListener("resize", resize, false);
    resize();

    const buildParticles = (img: HTMLImageElement, targets: Array<[number, number]>) => {
      // Read the small sampling variant; keep pixels by luminance so the
      // particles concentrate where the light is — the figure, the desk, the
      // lamp — and the void stays void.
      const sample = document.createElement("canvas");
      sample.width = img.naturalWidth;
      sample.height = img.naturalHeight;
      const c = sample.getContext("2d");
      if (!c) return;
      c.drawImage(img, 0, 0);
      const data = c.getImageData(0, 0, sample.width, sample.height).data;

      const starts: number[] = [];
      const colors: number[] = [];
      for (let y = 0; y < sample.height; y++) {
        for (let x = 0; x < sample.width; x++) {
          const i = (y * sample.width + x) * 4;
          const r = data[i]! / 255;
          const g = data[i + 1]! / 255;
          const b = data[i + 2]! / 255;
          const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          if (Math.random() > lum * 3.4 + 0.03) continue;
          // Jitter within the source pixel so the grid never shows.
          starts.push(
            (x + Math.random()) / sample.width - 0.5,
            0.5 - (y + Math.random()) / sample.height,
          );
          colors.push(r, g, b);
        }
      }

      let count = starts.length / 2;
      if (count > MAX_PARTICLES) {
        // Uniform thinning down to budget.
        const keep = MAX_PARTICLES / count;
        const s2: number[] = [];
        const c2: number[] = [];
        for (let i = 0; i < count; i++) {
          if (Math.random() > keep) continue;
          s2.push(starts[i * 2]!, starts[i * 2 + 1]!);
          c2.push(colors[i * 3]!, colors[i * 3 + 1]!, colors[i * 3 + 2]!);
        }
        starts.length = 0;
        starts.push(...s2);
        colors.length = 0;
        colors.push(...c2);
        count = starts.length / 2;
      }

      const aStart = new Float32Array(starts);
      const aColor = new Float32Array(colors);
      const aTarget = new Float32Array(count * 2);
      const aRand = new Float32Array(count * 4);
      for (let i = 0; i < count; i++) {
        const t = targets[Math.floor(Math.random() * targets.length)]!;
        // Slight spread inside the mark so density stays even.
        aTarget[i * 2] = t[0] + (Math.random() - 0.5) * 0.008;
        aTarget[i * 2 + 1] = t[1] + (Math.random() - 0.5) * 0.008;
        aRand.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      }

      const geometry = new Geometry(gl, {
        aStart: { size: 2, data: aStart },
        aTarget: { size: 2, data: aTarget },
        aColor: { size: 3, data: aColor },
        aRand: { size: 4, data: aRand },
      });

      const tint = TOOL_MARKS[0]!.tint;
      particleProgram = new Program(gl, {
        vertex: particleVertex,
        fragment: particleFragment,
        uniforms: {
          uTime: { value: 0 },
          uMorph: { value: stageState.morph },
          uAlpha: { value: stageState.heroAlpha },
          uDpr: { value: Math.min(window.devicePixelRatio || 1, 1.25) },
          uImgScale: { value: size.imgScale },
          uMarkScale: { value: size.markScale },
          uMarkPos: { value: [0, 0] },
          uMouse: { value: [0, 0] },
          uAspect: { value: size.w / size.h },
          uMarkTint: { value: tint },
        },
        transparent: true,
        depthTest: false,
      });
      particleMesh = new Mesh(gl, { mode: gl.POINTS, geometry, program: particleProgram });

      // Particles up → the static hero image hands over to the live field.
      document.documentElement.dataset.landingGl = "on";
    };

    const buildMarks = (capsFamily: string) => {
      const quad = new Geometry(gl, {
        position: { size: 2, data: new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]) },
        uv: { size: 2, data: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]) },
        index: { data: new Uint16Array([0, 1, 2, 1, 3, 2]) },
      });

      markPasses = [];
      document.querySelectorAll<HTMLElement>("[data-metal-anchor]").forEach((el) => {
        const idx = Number(el.dataset.metalAnchor);
        const tool = TOOL_MARKS[idx];
        if (!tool) return;
        const raster = rasterizeMark(tool, capsFamily);
        if (!raster) return;
        const texture = new Texture(gl, { image: raster, generateMipmaps: false });
        const program = new Program(gl, {
          vertex: markVertex,
          fragment: markFragment,
          uniforms: {
            tMap: { value: texture },
            uPos: { value: [0, 0] },
            uSize: { value: [1, 1] },
            uSweep: { value: 0 },
            uAlpha: { value: 0 },
            uTime: { value: 0 },
            uTint: { value: tool.tint },
          },
          transparent: true,
          depthTest: false,
        });
        if (idx === 0) seamEl = el;
        markPasses.push({ el, idx, mesh: new Mesh(gl, { geometry: quad, program }), program });
      });
      wheelStageEl = document.querySelector<HTMLElement>("[data-wheel-stage]");

      // The morph needs the first tool's silhouette as its target set. It
      // arrives here (fonts + raster ready), so (re)point existing particles.
      const first = rasterizeMark(TOOL_MARKS[0]!, capsFamily);
      if (first && particleMesh) {
        const targets = sampleMarkTargets(first);
        const attr = particleMesh.geometry.attributes.aTarget;
        const data = attr.data as Float32Array;
        for (let i = 0; i < data.length / 2; i++) {
          const t = targets[Math.floor(Math.random() * targets.length)]!;
          data[i * 2] = t[0] + (Math.random() - 0.5) * 0.008;
          data[i * 2 + 1] = t[1] + (Math.random() - 0.5) * 0.008;
        }
        attr.needsUpdate = true;
      }
    };

    // Asset loading. The hero sampler and the mark rasters are independent;
    // each pass comes alive as its inputs land. Until the marks build, the
    // morph flies to a provisional centered block (visually: a dense slab that
    // resolves into the mark as soon as fonts are ready — in practice fonts
    // land well before anyone scrolls).
    const img = new Image();
    if (!reducedMotion) {
      img.src = "/landing/hero-particles.jpg";
      void img
        .decode()
        .then(() => {
          if (cancelled) return;
          const provisional: Array<[number, number]> = [];
          for (let i = 0; i < 400; i++) {
            provisional.push([(Math.random() - 0.5) * 0.7, (Math.random() - 0.5) * 0.7]);
          }
          buildParticles(img, provisional);
          return document.fonts.ready;
        })
        .then(() => {
          if (cancelled) return;
          // The caps face's real family name, resolved through the CSS variable
          // next/font generates — canvas font strings can't use var().
          const probe = document.createElement("span");
          probe.style.fontFamily = "var(--font-caps, var(--font-neue-black))";
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          document.body.appendChild(probe);
          const family = getComputedStyle(probe).fontFamily || "sans-serif";
          probe.remove();
          buildMarks(family);
        })
        .catch(() => {
          // No sampler image → the static hero stays; background keeps running.
        });
    }

    /* Render loop. */
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let bgOnlySkip = false;
    let running = true;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      const delta = t - last;
      last = t;
      elapsed += delta;
      const time = elapsed * 0.001;

      mouse.x += (mouse.tx - mouse.x) * 0.07;
      mouse.y += (mouse.ty - mouse.y) * 0.07;

      // The seam handoff. As the anchor rises from the viewport's bottom edge
      // toward center, the formed swarm glides from its centered hold onto the
      // anchor's actual rect, and only then crossfades into the metal face —
      // one object changing material, never two marks on screen. Before the
      // marks build there is no anchor; the scripted heroAlpha carries the
      // fade instead.
      let pAlpha = stageState.heroAlpha;
      let solidMul = 1;
      if (seamEl && particleMesh && particleProgram) {
        const rect = seamEl.getBoundingClientRect();
        const t = Math.min(Math.max((1 - (rect.top + rect.height / 2) / size.h) / 0.5, 0), 1);
        let glide = Math.min(t / 0.7, 1);
        glide = glide * glide * (3 - 2 * glide);
        solidMul = Math.min(Math.max((t - 0.55) / 0.35, 0), 1);
        pAlpha = 1 - solidMul;
        const cx = ((rect.left + rect.width / 2) / size.w) * 2 - 1;
        const cy = -(((rect.top + rect.height / 2) / size.h) * 2 - 1);
        particleProgram.uniforms.uMarkPos.value = [cx * glide, cy * glide];
        particleProgram.uniforms.uMarkScale.value = [
          (rect.width / size.w) * 2,
          (rect.height / size.h) * 2,
        ];
      }
      const heroLive = particleMesh !== null && pAlpha > 0.004;

      // Which marks are near the viewport this frame, and where. The seam mark
      // renders free; the wheel marks are clipped to the stage below.
      const seamMarks: MarkPass[] = [];
      const wheelMarks: MarkPass[] = [];
      for (const pass of markPasses) {
        const rect = pass.el.getBoundingClientRect();
        if (rect.bottom < -size.h * 0.2 || rect.top > size.h * 1.2) continue;
        const cx = ((rect.left + rect.width / 2) / size.w) * 2 - 1;
        const cy = -(((rect.top + rect.height / 2) / size.h) * 2 - 1);
        pass.program.uniforms.uPos.value = [cx, cy];
        pass.program.uniforms.uSize.value = [(rect.width / size.w) * 2, (rect.height / size.h) * 2];
        const sweep = Math.min(
          Math.max(1 - (rect.top + rect.height / 2) / size.h, 0),
          1,
        );
        pass.program.uniforms.uSweep.value = sweep;
        pass.program.uniforms.uTime.value = time;
        const edge = Math.min(sweep / 0.08, 1) * Math.min((1 - sweep) / 0.08, 1);
        // Wheel marks also carry the mouth-proximity fade the wheel scrub
        // writes onto their elements; the seam mark carries the crossfade.
        const domA = pass.el.style.opacity === "" ? 1 : Number(pass.el.style.opacity);
        pass.program.uniforms.uAlpha.value = pass.idx === 0 ? edge * solidMul : edge * domA;
        if (pass.program.uniforms.uAlpha.value <= 0.004) continue;
        (pass.idx === 0 ? seamMarks : wheelMarks).push(pass);
      }

      // Background-only stretches render at half rate; nobody can tell on a
      // grain field, and it halves the idle GPU cost.
      if (!heroLive && seamMarks.length === 0 && wheelMarks.length === 0) {
        bgOnlySkip = !bgOnlySkip;
        if (bgOnlySkip) return;
      }

      bgProgram.uniforms.uTime.value = time;
      bgProgram.uniforms.uMouse.value = [mouse.x, mouse.y];
      renderer.render({ scene: bgMesh, clear: true });

      for (const pass of seamMarks) {
        renderer.render({ scene: pass.mesh, clear: false });
      }

      // The stage clips its overflow in the DOM, but the canvas is one fixed
      // layer — scissor stands in for the stage's overflow:hidden so marks
      // riding the circle never poke outside it.
      if (wheelMarks.length > 0 && wheelStageEl) {
        const sr = wheelStageEl.getBoundingClientRect();
        const x0 = Math.max(sr.left, 0);
        const y0 = Math.max(sr.top, 0);
        const x1 = Math.min(sr.right, size.w);
        const y1 = Math.min(sr.bottom, size.h);
        if (x1 > x0 && y1 > y0) {
          const dpr = renderer.dpr;
          gl.enable(gl.SCISSOR_TEST);
          gl.scissor(
            Math.round(x0 * dpr),
            Math.round((size.h - y1) * dpr),
            Math.round((x1 - x0) * dpr),
            Math.round((y1 - y0) * dpr),
          );
          for (const pass of wheelMarks) {
            renderer.render({ scene: pass.mesh, clear: false });
          }
          gl.disable(gl.SCISSOR_TEST);
        }
      }

      if (heroLive && particleMesh && particleProgram) {
        particleProgram.uniforms.uTime.value = time;
        particleProgram.uniforms.uMorph.value = stageState.morph;
        particleProgram.uniforms.uAlpha.value = pAlpha;
        particleProgram.uniforms.uMouse.value = [mouse.x, mouse.y];
        renderer.render({ scene: particleMesh, clear: false });
      }
    };
    raf = requestAnimationFrame(frame);

    // Hidden tab → stop the loop entirely; resume on return.
    const handleVisibility = () => {
      if (document.hidden) {
        if (running) cancelAnimationFrame(raf);
        running = false;
      } else if (!running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearTimeout(lostTimer);
      cancelAnimationFrame(raf);
      delete document.documentElement.dataset.landingGl;
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
      gl.canvas.removeEventListener("webglcontextlost", handleContextLost);
      // OGL never frees the context itself, and browsers cap live contexts —
      // hand it back explicitly or remounts eventually kill WebGL page-wide.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [generation]);

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 [&>canvas]:h-full [&>canvas]:w-full"
    />
  );
}
