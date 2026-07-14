"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { cn } from "@/lib/utils";

// The landing's two signature interactions, re-implemented from the reference
// site's mechanics (valeran.eu — verified against its live source, code
// written fresh):
//
// RollText — every character carries a duplicate of itself one line below via
// `text-shadow: 0 1.1em currentColor`; hovering the nearest [data-roll]
// ancestor slides each character up one line, staggered ~22ms per character.
// All CSS (see .roll-line/.roll-char in globals.css); this component only
// splits the text and hands each character its stagger index.
//
// Magnetic — the element leans toward the cursor while it's over the
// hitbox and snaps back elastically on leave. Children tagged [data-mag]
// get their own (usually stronger) pull, so a label or arrow leads the
// button. Pointer-fine hover devices only; inert under reduced motion.

export function RollText({ text, className }: { text: string; className?: string }) {
  return (
    <span className={cn("roll-line", className)}>
      <span aria-hidden className="roll-track">
        {Array.from(text).map((ch, i) => (
          <span key={i} className="roll-char" style={{ "--ri": i } as React.CSSProperties}>
            {ch === " " ? " " : ch}
          </span>
        ))}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}

export function Magnetic({
  children,
  strength = 0.25,
  className,
}: {
  children: React.ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const parts: Array<{ node: HTMLElement; s: number }> = [
      { node: el, s: strength },
      ...Array.from(el.querySelectorAll<HTMLElement>("[data-mag]")).map((node) => ({
        node,
        s: Number(node.dataset.mag) || strength * 1.6,
      })),
    ];

    const move = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const relX = e.clientX - r.left - r.width / 2;
      const relY = e.clientY - r.top - r.height / 2;
      for (const { node, s } of parts) {
        gsap.to(node, { x: relX * s, y: relY * s, duration: 0.8, ease: "power4.out" });
      }
    };
    const leave = () => {
      for (const { node } of parts) {
        gsap.to(node, { x: 0, y: 0, duration: 1.1, ease: "elastic.out(1, 0.3)" });
      }
    };

    el.addEventListener("mousemove", move);
    el.addEventListener("mouseleave", leave);
    return () => {
      el.removeEventListener("mousemove", move);
      el.removeEventListener("mouseleave", leave);
      gsap.killTweensOf(parts.map((p) => p.node));
    };
  }, [strength]);

  return (
    <span ref={ref} className={cn("inline-block", className)}>
      {children}
    </span>
  );
}
