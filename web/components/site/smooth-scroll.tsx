"use client";

import { useLayoutEffect } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

let instance: Lenis | null = null;

/** The live Lenis instance, if smooth scrolling is running on this page. */
export const lenis = () => instance;

/**
 * Inertial scroll on native scroll position. Lenis moves the real scrollTop,
 * so position: fixed, ScrollTrigger pins and the browser's own find-in-page
 * all keep working — the reason it is used here rather than a transform-based
 * smoother. GSAP's ticker drives it so scroll and every scrubbed tween advance
 * in the same frame. Skipped entirely under reduced motion.
 */
export function SmoothScroll() {
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const l = new Lenis({ lerp: 0.095, wheelMultiplier: 0.95, anchors: true });
    instance = l;
    l.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => l.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      l.destroy();
      instance = null;
    };
  }, []);
  return null;
}
