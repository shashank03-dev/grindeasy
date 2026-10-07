"use client";

import { gsap } from "gsap";

// Shared motion primitives. Kept framework-free so any client component (or a
// GSAP timeline callback) can call them on a plain element.

const GLYPHS = "░▒▓█▚▞▙▟/\\<>_-=+*#01";

/**
 * Decode `el` into `text`: every character churns through block glyphs and
 * locks left to right, the way a terminal redraws a line. Spaces never churn,
 * so word shapes hold while the letters resolve. Returns the tween so callers
 * can sequence or kill it.
 */
export function scramble(
  el: HTMLElement,
  text: string,
  { duration = 0.9, delay = 0 }: { duration?: number; delay?: number } = {},
) {
  const state = { p: 0 };
  return gsap.to(state, {
    p: 1,
    duration,
    delay,
    ease: "none",
    onUpdate: () => {
      const locked = Math.floor(state.p * text.length);
      let out = text.slice(0, locked);
      for (let i = locked; i < text.length; i++) {
        const ch = text[i]!;
        out += ch === " " ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
    },
    onComplete: () => {
      el.textContent = text;
    },
  });
}

export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export const pad = (n: number, width = 2) => String(Math.floor(n)).padStart(width, "0");

export function formatElapsed(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  return `${pad(s / 3600)}:${pad((s % 3600) / 60)}:${pad(s % 60)}`;
}
