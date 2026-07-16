"use client";

import { useEffect, useRef } from "react";

// The finale's backdrop: the page's particle story, closing. The hero
// photograph came apart into dust at the top of the page; here the same dust
// drifts in from the section's edges, accelerates as it nears the presence
// card, and lands on it — a small glow blip at the boundary. Plain 2D canvas:
// a few dozen points is nothing, WebGL would be ceremony. Runs only while the
// section is on screen; reduced motion renders nothing (the CSS bloom stays).

// The hero grade's dust, as canvas fills: mostly cold silver, some ice light,
// a rare ember — same ratios the photograph reads in.
const DUST = [
  { rgb: "223 230 238", weight: 0.76 },
  { rgb: "148 194 230", weight: 0.18 },
  { rgb: "240 143 61", weight: 0.06 },
] as const;

const pickDust = () => {
  let r = Math.random();
  for (const d of DUST) {
    r -= d.weight;
    if (r <= 0) return d.rgb;
  }
  return DUST[0].rgb;
};

type Particle = {
  // Spawn point (section space) and the landing spot, kept as a normalized
  // perimeter position so it tracks the card while the assemble tween scales it.
  sx: number;
  sy: number;
  side: number;
  frac: number;
  t: number; // 0→1 travel progress
  dur: number;
  size: number;
  alpha: number;
  rgb: string;
  wobbleAmp: number;
  wobbleFreq: number;
  wobblePhase: number;
  blip: number; // >0 while the landing glow plays
};

function perimeterPoint(x: number, y: number, w: number, h: number, side: number, frac: number) {
  if (side === 0) return { x: x + w * frac, y };
  if (side === 1) return { x: x + w, y: y + h * frac };
  if (side === 2) return { x: x + w * frac, y: y + h };
  return { x, y: y + h * frac };
}

export function FinaleInfall() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const section = canvas.parentElement;
    const card = section?.querySelector<HTMLElement>("[data-act-card]");
    if (!section || !card) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = section.clientWidth;
      h = section.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(section);

    const spawn = (p: Particle) => {
      // Born just outside the frame, on a random edge.
      const side = Math.floor(Math.random() * 4);
      const at = perimeterPoint(-16, -16, w + 32, h + 32, side, Math.random());
      p.sx = at.x;
      p.sy = at.y;
      p.side = Math.floor(Math.random() * 4);
      p.frac = 0.1 + Math.random() * 0.8;
      p.t = 0;
      p.dur = 4.5 + Math.random() * 5;
      p.size = 0.6 + Math.random() * 1.2;
      p.alpha = 0.2 + Math.random() * 0.45;
      p.rgb = pickDust();
      p.wobbleAmp = 12 + Math.random() * 26;
      p.wobbleFreq = 2 + Math.random() * 3;
      p.wobblePhase = Math.random() * Math.PI * 2;
      p.blip = 0;
    };

    const particles: Particle[] = Array.from(
      // Density-scaled, capped: a mist, never a swarm.
      { length: Math.round(Math.min(150, (w * h) / 10000)) },
      () => {
        const p = {} as Particle;
        spawn(p);
        p.t = Math.random(); // desync the first pass so there's no pulse
        return p;
      },
    );

    let raf = 0;
    let last = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      // Clamped at 0 too: right after the observer restarts the loop, the rAF
      // timestamp can sit behind the performance.now() stored in `last`, and a
      // negative step would drag a fresh blip below zero — a negative radius
      // for createRadialGradient, which throws.
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.05));
      last = now;
      ctx.clearRect(0, 0, w, h);

      // Card rect in section space, once per frame — the landing spots ride
      // the assemble tween's scale for free.
      const cr = card.getBoundingClientRect();
      const sr = section.getBoundingClientRect();
      const cx = cr.left - sr.left;
      const cy = cr.top - sr.top;

      for (const p of particles) {
        const target = perimeterPoint(cx, cy, cr.width, cr.height, p.side, p.frac);

        if (p.blip > 0) {
          // The landing: a tiny bloom at the card's edge, then rebirth.
          p.blip += dt / 0.32;
          if (p.blip >= 1) {
            spawn(p);
            continue;
          }
          const r = 2 + 7 * p.blip;
          const g = ctx.createRadialGradient(target.x, target.y, 0, target.x, target.y, r);
          g.addColorStop(0, `rgb(${p.rgb} / ${(1 - p.blip) * 0.55})`);
          g.addColorStop(1, `rgb(${p.rgb} / 0)`);
          ctx.fillStyle = g;
          ctx.fillRect(target.x - r, target.y - r, r * 2, r * 2);
          continue;
        }

        p.t += dt / p.dur;
        if (p.t >= 1) {
          p.blip = 0.001;
          continue;
        }

        // Slow drift that becomes a fall: eased progress does the
        // acceleration, and the sideways wobble dies out on approach.
        const e = Math.pow(p.t, 2.2);
        const dx = target.x - p.sx;
        const dy = target.y - p.sy;
        const len = Math.hypot(dx, dy) || 1;
        const sway = Math.sin(p.t * p.wobbleFreq * Math.PI + p.wobblePhase) * p.wobbleAmp * (1 - p.t);
        const x = p.sx + dx * e + (-dy / len) * sway;
        const y = p.sy + dy * e + (dx / len) * sway;

        const a = p.alpha * Math.min(p.t / 0.08, 1);
        ctx.fillStyle = `rgb(${p.rgb} / ${a})`;
        ctx.beginPath();
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // Only animate while the finale is actually in view.
    let running = false;
    const io = new IntersectionObserver(([entry]) => {
      const visible = entry?.isIntersecting ?? false;
      if (visible && !running) {
        running = true;
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (!visible && running) {
        running = false;
        cancelAnimationFrame(raf);
      }
    });
    io.observe(section);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0" />;
}
