"use client";

import { gsap } from "gsap";
import { useEffect, useRef } from "react";
import { Camera, Geometry, Mesh, Program, Renderer } from "ogl";

// Purpose-built particle field for the personal dashboard. The OGL scaffolding
// (Renderer/Camera/Geometry/Program/Mesh, the point-cloud generation, the hover
// tracking) follows React Bits' `Particles`; the shaders are extended for this
// product: a staggered swirl "birth" on sign-in, an energized state while the
// user is coding, and a mouse-driven hue shift. Continuous values live in OGL
// uniforms and GSAP tweens, never React state, so nothing re-renders per frame.

export interface ParticlesProps {
  /** Tier palette as hex strings; particles sample randomly across them. */
  colors: string[];
  /** 0 = hidden (signed out / pre-birth), 1 = full field. GSAP-tweened. */
  revealed: boolean;
  /** Brighter and livelier while a tool is actively running. */
  online: boolean;
  count?: number;
  spread?: number;
  baseSize?: number;
  className?: string;
}

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace(/^#/, "");
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const int = parseInt(h, 16);
  return [((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255];
};

const vertex = /* glsl */ `
  attribute vec3 position;
  attribute vec4 random;
  attribute vec3 color;

  uniform mat4 modelMatrix;
  uniform mat4 viewMatrix;
  uniform mat4 projectionMatrix;
  uniform float uTime;
  uniform float uSpread;
  uniform float uBaseSize;
  uniform float uReveal;   // 0..1 birth progress
  uniform float uEnergy;   // 0..1 online energize

  varying vec4 vRandom;
  varying vec3 vColor;
  varying float vProg;     // per-particle birth progress, for staggered fade

  void main() {
    vRandom = random;
    vColor = color;

    // Stagger each particle's arrival by its own random seed, then ease-out so
    // the field settles gently rather than snapping into place.
    float prog = clamp(uReveal * 1.6 - random.x * 0.6, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - prog, 3.0);
    vProg = e;

    vec3 pos = position * uSpread * e;
    pos.z *= 10.0;

    // Swirl inward while being born; unwinds to zero as the particle arrives.
    float ang = (1.0 - e) * 3.0;
    float ca = cos(ang);
    float sa = sin(ang);
    pos.xy = mat2(ca, -sa, sa, ca) * pos.xy;

    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime * (1.0 + 0.6 * uEnergy);
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);

    vec4 mvPos = viewMatrix * mPos;
    float size = uBaseSize * (1.0 + 0.2 * uEnergy) * (0.4 + 0.6 * e);
    gl_PointSize = (size * (1.0 + 0.5 * (random.x - 0.5))) / length(mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uEnergy;
  uniform float uHue;         // radians, mouse-driven hue rotation
  uniform vec3 uLiveColor;    // phosphor green mixed in while online

  varying vec4 vRandom;
  varying vec3 vColor;
  varying float vProg;

  // Hue rotation about the luminance axis (Rodrigues rotation).
  vec3 hueShift(vec3 col, float a) {
    const vec3 k = vec3(0.57735);
    float c = cos(a);
    return col * c + cross(k, col) * sin(a) + k * dot(k, col) * (1.0 - c);
  }

  void main() {
    vec2 uv = gl_PointCoord.xy;
    float d = length(uv - vec2(0.5));
    // Soft round sprite with a bright core.
    float circle = smoothstep(0.5, 0.15, d);
    if (circle <= 0.0) discard;

    vec3 col = hueShift(vColor, uHue);
    // Online: the field warms toward the live phosphor green as it energizes.
    col = mix(col, uLiveColor, 0.4 * uEnergy);
    col *= 1.0 + 0.4 * uEnergy;
    col += 0.15 * sin(uv.yxx + uTime + vRandom.y * 6.28);

    gl_FragColor = vec4(col, circle * vProg);
  }
`;

export default function Particles({
  colors,
  revealed,
  online,
  count = 320,
  spread = 11,
  baseSize = 110,
  className,
}: ParticlesProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  // Shared handles so the reveal/energy effect can tween uniforms the build
  // effect created, without rebuilding the scene.
  const uniformsRef = useRef<{
    uReveal: { value: number };
    uEnergy: { value: number };
    uHue: { value: number };
  } | null>(null);
  const bornRef = useRef(false);

  // Build the WebGL scene. Rebuilds only on structural changes (palette/count),
  // never on reveal/online — those animate live below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // OGL throws if a WebGL context can't be created (unsupported browser,
    // disabled, GPU blocklist, or too many live contexts). Degrade to the plain
    // black background instead of crashing the page.
    let renderer: Renderer;
    try {
      renderer = new Renderer({ depth: false, alpha: true });
    } catch {
      return;
    }
    const gl = renderer.gl;
    container.appendChild(gl.canvas);
    gl.clearColor(0, 0, 0, 0);

    const camera = new Camera(gl, { fov: 15 });
    camera.position.set(0, 0, 20);

    const resize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.perspective({ aspect: gl.canvas.width / gl.canvas.height });
    };
    window.addEventListener("resize", resize, false);
    resize();

    const handleMouseMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();
      mouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      };
    };
    window.addEventListener("mousemove", handleMouseMove);

    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count * 4);
    const colorData = new Float32Array(count * 3);
    const palette = colors.length > 0 ? colors : ["#ffffff"];
    for (let i = 0; i < count; i++) {
      let x: number, y: number, z: number, len: number;
      do {
        x = Math.random() * 2 - 1;
        y = Math.random() * 2 - 1;
        z = Math.random() * 2 - 1;
        len = x * x + y * y + z * z;
      } while (len > 1 || len === 0);
      const r = Math.cbrt(Math.random());
      positions.set([x * r, y * r, z * r], i * 3);
      randoms.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
      colorData.set(hexToRgb(palette[Math.floor(Math.random() * palette.length)]!), i * 3);
    }

    const geometry = new Geometry(gl, {
      position: { size: 3, data: positions },
      random: { size: 4, data: randoms },
      color: { size: 3, data: colorData },
    });

    // Preserve reveal/energy across a rebuild so changing tier does not replay
    // the birth. Start collapsed only the very first time.
    const startReveal = bornRef.current ? (revealed ? 1 : 0) : 0;
    const uReveal = { value: startReveal };
    const uEnergy = { value: online ? 1 : 0 };
    const uHue = { value: 0 };
    uniformsRef.current = { uReveal, uEnergy, uHue };

    const program = new Program(gl, {
      vertex,
      fragment,
      uniforms: {
        uTime: { value: 0 },
        uSpread: { value: spread },
        uBaseSize: { value: baseSize },
        uReveal,
        uEnergy,
        uHue,
        // Phosphor green (matches the interface --primary accent).
        uLiveColor: { value: [0.36, 0.89, 0.6] },
      },
      transparent: true,
      depthTest: false,
    });

    const particles = new Mesh(gl, { mode: gl.POINTS, geometry, program });

    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    const hueQuick = gsap.quickTo(uHue, "value", { duration: 0.8, ease: "power2.out" });

    const update = (t: number) => {
      raf = requestAnimationFrame(update);
      const delta = t - last;
      last = t;
      elapsed += delta * (reduced ? 0 : 0.12);
      program.uniforms.uTime.value = elapsed * 0.001;

      if (!reduced) {
        // Field drifts toward the cursor; hue leans with horizontal position.
        particles.position.x += (-mouseRef.current.x * 0.6 - particles.position.x) * 0.05;
        particles.position.y += (-mouseRef.current.y * 0.6 - particles.position.y) * 0.05;
        particles.rotation.z += 0.0006 + 0.0008 * uEnergy.value;
        hueQuick(mouseRef.current.x * 0.6 + mouseRef.current.y * 0.15);
      }
      renderer.render({ scene: particles, camera });
    };
    raf = requestAnimationFrame(update);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(raf);
      gsap.killTweensOf(uReveal);
      gsap.killTweensOf(uEnergy);
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, count, spread, baseSize]);

  // Birth reveal + energize. Discrete prop changes (sign-in, online toggle), so
  // GSAP tweens the live uniforms; reduced motion snaps instead.
  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = revealed ? 1 : 0;

    if (reduced) {
      u.uReveal.value = target;
    } else if (revealed && !bornRef.current) {
      // The hero moment: particles take birth from a tight swirl into the field.
      gsap.fromTo(
        u.uReveal,
        { value: 0 },
        { value: 1, duration: 2.4, ease: "power2.out" },
      );
    } else {
      gsap.to(u.uReveal, { value: target, duration: 1.2, ease: "power2.inOut" });
    }
    if (revealed) bornRef.current = true;

    gsap.to(u.uEnergy, {
      value: online ? 1 : 0,
      duration: reduced ? 0 : 1.4,
      ease: "sine.inOut",
    });
  }, [revealed, online]);

  return <div ref={containerRef} className={className} />;
}
