"use client";

import { gsap } from "gsap";
import { setField } from "@/components/site/dither-field";
import { lenis } from "@/components/site/smooth-scroll";
import { markReady } from "./scenes";

// The boot screen: the agent coming up. A dot-matrix counter runs to 100 while
// a short scan log prints the folders it is about to watch; then the screen
// lifts away and the dither field prints itself in, cell by cell. Once per
// session — a returning visitor goes straight to the hero.

const LOG = [
  "stat ~/.claude/projects",
  "stat ~/.codex/sessions",
  "stat ~/.cursor/chats",
  "stat ~/.gemini/tmp",
  "discord ipc · connected",
  "reading mtimes only",
];

const SEEN_KEY = "ge-boot";

export function Boot() {
  return (
    <div
      data-boot
      style={{ clipPath: "inset(0 0 0% 0)" }}
      className="fixed inset-0 z-[95] flex flex-col justify-between bg-ink px-4 py-5 md:px-10 md:py-8"
    >
      <div className="label flex justify-between text-muted-foreground">
        <span>grindeasy agent</span>
        <span>boot</span>
      </div>
      <div className="flex items-end justify-between gap-6">
        <ul data-boot-log className="label flex flex-col gap-1.5 text-muted-foreground">
          {LOG.map((line) => (
            <li key={line} className="opacity-0">
              <span className="text-signal">›</span> {line}
            </li>
          ))}
        </ul>
        <p
          data-boot-count
          className="font-dot text-[clamp(5rem,20vw,16rem)] leading-[0.8] tabular-nums text-paper"
        >
          000
        </p>
      </div>
    </div>
  );
}

/** Returns true if the boot sequence will play (first visit this session). */
export function buildBoot(): boolean {
  const el = document.querySelector<HTMLElement>("[data-boot]");
  let seen = false;
  try {
    seen = sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Storage blocked: just play it.
  }
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!el || seen || reduced) {
    if (el) el.style.display = "none";
    setField({ reveal: 1 });
    markReady();
    return false;
  }

  lenis()?.stop();
  const count = el.querySelector<HTMLElement>("[data-boot-count]")!;
  const lines = el.querySelectorAll<HTMLElement>("[data-boot-log] li");
  const n = { v: 0 };

  gsap
    .timeline({
      onComplete: () => {
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          // Ignore — worst case it plays again next load.
        }
        el.style.display = "none";
        lenis()?.start();
      },
    })
    .to(n, {
      v: 100,
      duration: 1.9,
      ease: "power2.inOut",
      onUpdate: () => {
        count.textContent = String(Math.round(n.v)).padStart(3, "0");
      },
    })
    .to(lines, { opacity: 1, duration: 0.01, stagger: 0.28 }, 0.1)
    .add(() => {
      setField({ reveal: 1 });
      markReady();
    }, "+=0.15")
    .to(el, { clipPath: "inset(0 0 100% 0)", duration: 1, ease: "expo.inOut" }, "<");

  return true;
}
