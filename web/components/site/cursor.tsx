"use client";

import { useEffect, useRef } from "react";
import { pad } from "./motion";

/**
 * A crosshair square in difference blend that reads out its own screen
 * coordinates — the page measuring itself. Grows over anything clickable.
 * Fine pointers only, never under reduced motion; the system cursor stays
 * visible underneath, so nothing depends on it.
 */
export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  const coords = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;

    let x = -100;
    let y = -100;
    let cx = x;
    let cy = y;
    let raf = 0;
    const tick = () => {
      cx += (x - cx) * 0.28;
      cy += (y - cy) * 0.28;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.2 ? requestAnimationFrame(tick) : 0;
    };
    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      el.style.opacity = "1";
      if (coords.current) coords.current.textContent = `X${pad(x, 4)} Y${pad(y, 4)}`;
      const target = e.target as Element | null;
      const hot = target?.closest?.("a, button, [data-cursor]");
      if (hot) el.setAttribute("data-hover", "");
      else el.removeAttribute("data-hover");
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onDown = () => el.setAttribute("data-down", "");
    const onUp = () => el.removeAttribute("data-down");
    const onLeave = () => (el.style.opacity = "0");
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className="cursor hidden opacity-0 [@media(pointer:fine)]:block">
      <span ref={coords} className="cursor__coords" />
    </div>
  );
}
