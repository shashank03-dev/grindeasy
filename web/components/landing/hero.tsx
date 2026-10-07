"use client";

import Link from "next/link";
import { useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { setField } from "@/components/site/dither-field";
import { scramble } from "@/components/site/motion";
import { whenReady } from "./scenes";

gsap.registerPlugin(ScrollTrigger, SplitText);

// The sentence the page opens on, finished live by whatever grindeasy would
// detect. The typed line is plain text the typewriter rewrites freely; only
// the static lines are split.
const TOOLS = [
  "Claude Code",
  "Codex",
  "Cursor",
  "Gemini CLI",
  "Windsurf",
  "Copilot",
  "Zed",
  "Aider",
];

export function Hero() {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard?.writeText("npx grindeasy").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  return (
    <section
      id="hero"
      data-chapter="01 Signal"
      data-scene="hero"
      className="relative z-10 flex min-h-svh flex-col px-4 pb-6 pt-24 md:px-10 md:pb-8 md:pt-28"
    >
      <div data-intro className="flex flex-1 flex-col">
        <p data-hero-eyebrow className="label text-muted-foreground">
          [01] Local agent · Discord Rich Presence · MIT
        </p>

        <div className="mt-auto grid gap-10 md:grid-cols-12 md:items-end">
          <h1 className="display text-[clamp(3.4rem,10.4vw,11.5rem)] text-paper md:col-span-9">
            <span data-hero-line className="block">
              See what
            </span>
            <span data-hero-line className="block">
              you’re coding
            </span>
            <span data-hero-line className="block">
              with:
            </span>
            {/* The line the sentence is waiting for. Pixel face, phosphor, a
                touch smaller so the longest name still fits the column. */}
            <span className="mt-[0.06em] block overflow-hidden pb-[0.08em] text-[0.74em] leading-[1]">
              <span data-hero-typed className="inline-flex items-baseline font-pixel tracking-[-0.02em] text-signal">
                <span data-hero-tool>Claude Code</span>
                <span aria-hidden className="caret" />
              </span>
            </span>
          </h1>

          <div className="flex flex-col gap-7 border border-line bg-ink/75 p-5 backdrop-blur-md md:col-span-3 md:mb-[1.2vw]">
            <p data-hero-sub className="max-w-[34ch] text-[16px] leading-[1.45] text-paper/80">
              A tiny local agent that puts the AI tool you’re actually using on your Discord
              profile, live while you work.{" "}
              <span className="text-paper">It never reads your code.</span>
            </p>
            <div data-hero-actions className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <button type="button" onClick={copy} className="shell" aria-label="Copy install command">
                <span className="text-signal">$</span>
                <span>npx grindeasy</span>
                <span className="label text-[10px] text-muted-foreground" aria-live="polite">
                  {copied ? "copied" : "copy"}
                </span>
              </button>
              <Link href="/leaderboard" className="bracket">
                See the board
              </Link>
            </div>
          </div>
        </div>

        <div
          data-hero-hud
          className="label mt-10 grid grid-cols-2 gap-y-2 border-t border-line pt-4 text-paper/80 md:grid-cols-4"
        >
          <span data-scramble="Watching 13 tools">Watching 13 tools</span>
          <span data-scramble="Signal · mtime only" className="text-right md:text-left">
            Signal · mtime only
          </span>
          <span data-scramble="Free forever" className="hidden md:block">
            Free forever
          </span>
        </div>
      </div>
    </section>
  );
}

export function buildHero(reduced: boolean) {
  const section = document.querySelector<HTMLElement>("#hero")!;
  const intro = section.querySelector<HTMLElement>("[data-intro]")!;

  if (reduced) {
    gsap.set(intro, { opacity: 1 });
    return () => {};
  }

  const split = SplitText.create("[data-hero-line]", { type: "lines", mask: "lines", linesClass: "line-mask" });
  const toolEl = section.querySelector<HTMLElement>("[data-hero-tool]")!;
  toolEl.textContent = "";

  // Typewriter: type, hold, delete, next. One repeating timeline so a revert
  // kills it cleanly.
  const cycle = gsap.timeline({ repeat: -1, paused: true });
  const type = (name: string, dir: "in" | "out") => {
    const o = { n: dir === "in" ? 0 : name.length };
    return gsap.to(o, {
      n: dir === "in" ? name.length : 0,
      duration: Math.max(name.length * (dir === "in" ? 0.06 : 0.03), 0.3),
      ease: "none",
      onUpdate: () => {
        toolEl.textContent = name.slice(0, Math.round(o.n));
      },
    });
  };
  TOOLS.forEach((name) => cycle.add(type(name, "in")).to({}, { duration: 1.8 }).add(type(name, "out")));

  gsap.set(intro, { opacity: 1 });
  const tl = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } });
  tl.from(split.lines, { yPercent: 115, duration: 1.4, stagger: 0.1 })
    .from("[data-hero-typed]", { yPercent: 110, duration: 1.2 }, 0.3)
    .call(() => cycle.play(0), undefined, 0.9)
    .add(() => {
      const eyebrow = section.querySelector<HTMLElement>("[data-hero-eyebrow]")!;
      scramble(eyebrow, eyebrow.textContent ?? "", { duration: 0.8 });
      section.querySelectorAll<HTMLElement>("[data-scramble]").forEach((el, i) =>
        scramble(el, el.dataset.scramble!, { duration: 0.9, delay: 0.5 + i * 0.12 }),
      );
    }, 0)
    .from("[data-hero-sub]", { opacity: 0, y: 24, duration: 1 }, 0.55)
    .from("[data-hero-actions] > *", { opacity: 0, y: 18, duration: 0.9, stagger: 0.08 }, 0.7)
    .from("[data-hero-hud]", { opacity: 0, duration: 0.6 }, 0.4);
  whenReady(() => tl.play());

  // Leaving: the copy drifts up (at full strength — anything still on screen
  // stays readable) while the object turns a quarter.
  gsap.to(intro, {
    yPercent: -8,
    ease: "none",
    scrollTrigger: { trigger: section, start: "45% top", end: "bottom top", scrub: true },
  });
  const spin = { v: 0 };
  gsap.to(spin, {
    v: Math.PI * 0.6,
    ease: "none",
    scrollTrigger: { trigger: section, start: "top top", end: "bottom top", scrub: true },
    onUpdate: () => setField({ spin: spin.v }),
  });

  return () => {
    cycle.kill();
    split.revert();
  };
}
