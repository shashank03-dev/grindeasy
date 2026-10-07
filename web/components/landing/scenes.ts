"use client";

import { SHAPES, hexToRgb, setField, type FieldTargets } from "@/components/site/dither-field";

// One dither-field pose per chapter. Positions are in viewport heights from
// screen centre; on narrow screens every pose is pulled to centre, shrunk and
// lifted, because there the object sits behind the copy rather than beside it.

const PAPER = hexToRgb("#ecebe4");
const SIGNAL = hexToRgb("#9cf27f");

export type Scene = Omit<FieldTargets, "reveal" | "spin">;

export const SCENES = {
  hero: { shape: SHAPES.core, x: 0.5, y: 0.04, scale: 0.78, tint: PAPER, energy: 0.6 },
  clock: { shape: SHAPES.ring, x: 0.42, y: -0.05, scale: 0.95, tint: PAPER, energy: 0.35 },
  scan: { shape: SHAPES.scan, x: 0.19, y: 0, scale: 0.9, tint: PAPER, energy: 0.5 },
  card: { shape: SHAPES.card, x: 0.44, y: 0.0, scale: 0.6, tint: SIGNAL, energy: 0.3 },
  tiers: { shape: SHAPES.diamond, x: 0.5, y: 0.04, scale: 0.85, tint: PAPER, energy: 0.45 },
  cage: { shape: SHAPES.cage, x: 0, y: 0, scale: 1, tint: PAPER, energy: 0.4 },
  board: { shape: SHAPES.core, x: 0.45, y: 0.1, scale: 0.85, tint: SIGNAL, energy: 0.9 },
} satisfies Record<string, Scene>;

let active: Scene | null = null;

/** Whether `scene` is the pose the page last applied. */
export const isActiveScene = (scene: Scene) => active === scene;

export function applyScene(scene: Scene) {
  active = scene;
  const narrow = window.innerWidth < 768;
  setField(
    narrow
      ? { ...scene, x: 0.08, y: 0.24, scale: scene.scale * 0.62, tint: [...scene.tint] }
      : { ...scene, tint: [...scene.tint] },
  );
}

// The boot sequence gates the hero's entrance. It flips this once, and
// anything waiting on it runs then (or immediately, if it already flipped).
let ready = false;
const waiting: Array<() => void> = [];

export function markReady() {
  if (ready) return;
  ready = true;
  waiting.splice(0).forEach((fn) => fn());
}

export function whenReady(fn: () => void) {
  if (ready) fn();
  else waiting.push(fn);
}

/** Reset for a fresh mount (client-side navigation back to the landing). */
export function resetReady() {
  ready = false;
  waiting.length = 0;
}
