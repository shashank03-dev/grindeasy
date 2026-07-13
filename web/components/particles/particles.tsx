"use client";

import { gsap } from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { useCallback, useEffect, useRef } from "react";
import { Camera, Geometry, Mesh, Program, Renderer } from "ogl";
import { hasWebGL } from "@/lib/webgl";

gsap.registerPlugin(CustomEase);

// Birth curve for the sign-in reveal. Deliberately NOT front-loaded: it starts
// slow (the field takes a beat to appear), keeps an even pace through the middle
// so particles trickle in rather than bursting, then settles softly. Paired with
// the wide per-particle stagger in the shader, this reads as a gradual bloom.
const BIRTH_EASE = CustomEase.create("birth", "M0,0 C0.15,0.02 0.32,1 1,1");

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

    // Wide per-particle stagger: each particle waits for its own slot in the
    // reveal, spread across the whole birth so the swarm streams in continuously
    // instead of arriving all at once. STAGGER is the fraction of the reveal the
    // arrivals are smeared over.
    const float STAGGER = 1.8;
    float prog = clamp(uReveal * (1.0 + STAGGER) - random.x * STAGGER, 0.0, 1.0);
    // Ease-out, so each particle decelerates as it homes in and settles.
    float e = 1.0 - pow(1.0 - prog, 3.0);
    // Opacity is a smoothstep over the flight: the particle ghosts in as it
    // travels rather than popping, so you see it streaking inward before it lands.
    vProg = smoothstep(0.0, 1.0, prog);

    // Converging swarm. Each particle's home is its settled point in the field;
    // at birth it is flung outward in the screen plane, out past the edges, then
    // flies back in and converges home.
    vec3 target = position * uSpread;
    target.z *= 10.0;

    // Launch mostly in x/y with little depth, so the swarm arrives from the edges
    // rather than from deep space. Distance varies per particle for a layered
    // stream instead of one uniform shell.
    vec3 outward = normalize(vec3(position.xy, position.z * 0.15) + vec3(0.0001));
    vec3 start = target + outward * uSpread * (2.6 + 1.4 * random.y);

    vec3 pos = mix(start, target, e);

    // A shared inward curl (plus per-particle variance) that unwinds to zero on
    // arrival, so particles arc in like a swarm instead of sliding straight in.
    float ang = (1.0 - e) * (1.5 + 1.2 * (random.z - 0.5));
    float ca = cos(ang);
    float sa = sin(ang);
    pos.xy = mat2(ca, -sa, sa, ca) * pos.xy;

    vec4 mPos = modelMatrix * vec4(pos, 1.0);
    float t = uTime * (1.0 + 0.6 * uEnergy);
    mPos.x += sin(t * random.z + 6.28 * random.w) * mix(0.1, 1.5, random.x);
    mPos.y += sin(t * random.y + 6.28 * random.x) * mix(0.1, 1.5, random.w);
    mPos.z += sin(t * random.w + 6.28 * random.y) * mix(0.1, 1.5, random.z);

    vec4 mvPos = viewMatrix * mPos;
    float size = uBaseSize * (1.0 + 0.2 * uEnergy) * (0.5 + 0.5 * e);
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
  type Uniforms = {
    uReveal: { value: number };
    uEnergy: { value: number };
    uHue: { value: number };
  };
  const uniformsRef = useRef<Uniforms | null>(null);
  const bornRef = useRef(false);
  // A rebuild (tier change) throws away the uniform objects, so the reveal
  // progress has to survive outside them or the field would restart from empty
  // — or, worse, never restart at all. Mirrored every frame; read by the next
  // build to pick up exactly where the old scene left off.
  const revealValueRef = useRef(0);
  // Drive the uniforms to whatever the current props ask for. Called both when
  // the props change AND after every rebuild, so a scene swap mid-birth resumes
  // the animation instead of stranding the field at whatever value it held.
  // Reveal/online are passed in rather than closed over, so the build effect can
  // animate the latest props without taking them as dependencies (which would
  // rebuild the whole scene every time the user goes online).
  const play = useCallback((u: Uniforms, revealed: boolean, online: boolean) => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = revealed ? 1 : 0;

    // Never let two tweens fight over the same uniform: a sign-out landing mid
    // birth, or a rebuild re-arming the reveal, must supersede the tween in
    // flight rather than tick alongside it (GSAP's default is overwrite: false).
    gsap.killTweensOf(u.uReveal);

    if (reduced) {
      u.uReveal.value = target;
      revealValueRef.current = target;
      if (revealed) bornRef.current = true;
    } else if (revealed && !bornRef.current) {
      // The hero moment: the swarm converges in over a bespoke bloom curve, slow
      // and unhurried so the field materializes gradually rather than snapping in.
      //
      // bornRef flips only when the birth COMPLETES, never synchronously. React
      // Strict Mode double-mounts this component in development; a synchronous
      // flag would be set on the throwaway first mount, so the surviving mount
      // would see "already born" and start fully revealed. Resuming from the
      // current value (rather than hard-resetting to 0) is what makes that safe:
      // a rebuild picks the birth back up instead of replaying it from empty.
      const remaining = 1 - u.uReveal.value;
      gsap.to(u.uReveal, {
        value: 1,
        duration: 3.4 * remaining,
        ease: BIRTH_EASE,
        onComplete: () => {
          bornRef.current = true;
        },
      });
    } else {
      gsap.to(u.uReveal, { value: target, duration: 1.2, ease: "power2.inOut" });
      if (revealed) bornRef.current = true;
    }

    gsap.killTweensOf(u.uEnergy);
    gsap.to(u.uEnergy, {
      value: online ? 1 : 0,
      duration: reduced ? 0 : 1.4,
      ease: "sine.inOut",
    });
  }, []);

  // Build the WebGL scene. Rebuilds only on structural changes (palette/count),
  // never on reveal/online — those animate live below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Ask first, because OGL does not ask: it logs its own
    // `console.error('unable to create webgl context')` and then throws on the
    // null context. Without this, a browser with no WebGL at all (software
    // rendering off, GPU blocklisted, VM) prints a console error on every mount.
    if (!hasWebGL()) {
      // No live scene, so no uniforms to tween. Clearing the handle keeps a
      // failed rebuild from leaving the reveal effect driving the dead scene's
      // objects, which would flip bornRef against a field nobody can see.
      uniformsRef.current = null;
      return;
    }

    // Still guarded: the probe can pass and the real context still fail if the
    // browser is at its context limit at this exact moment.
    let renderer: Renderer;
    try {
      renderer = new Renderer({ depth: false, alpha: true });
    } catch {
      uniformsRef.current = null;
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
    // the birth from empty. Start collapsed only on the very first build.
    const uReveal = { value: revealValueRef.current };
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
      // Mirror the live reveal so a rebuild can resume from it.
      revealValueRef.current = uReveal.value;

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

    // Re-arm the reveal against the uniforms that were just created. Without
    // this, a rebuild (tier change) would swap in fresh uniforms that no effect
    // ever tweens — the reveal effect below only re-runs when its own props
    // change — and the field would sit at its start value forever.
    play({ uReveal, uEnergy, uHue }, revealed, online);

    return () => {
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(raf);
      gsap.killTweensOf(uReveal);
      gsap.killTweensOf(uEnergy);
      gsap.killTweensOf(uHue);
      if (container.contains(gl.canvas)) container.removeChild(gl.canvas);

      // Dropping the canvas does NOT free the GL context, and OGL never does it
      // either ("TODO: Handle context loss" — Renderer.js). A browser allows only
      // a handful of live contexts (~16 in Chrome), so every rebuild, remount,
      // and Strict Mode double-mount used to strand one: past the cap
      // getContext() returns null forever and the field silently dies for the
      // rest of the session. Hand the context back explicitly.
      gl.getExtension("WEBGL_lose_context")?.loseContext();
      uniformsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colors, count, spread, baseSize]);

  // Birth reveal + energize. Discrete prop changes (sign-in, online toggle), so
  // GSAP tweens the live uniforms; reduced motion snaps instead. The build
  // effect drives the same function, so both paths stay in step.
  useEffect(() => {
    const u = uniformsRef.current;
    if (!u) return;
    play(u, revealed, online);
  }, [revealed, online, play]);

  return <div ref={containerRef} className={className} />;
}
