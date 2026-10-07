"use client";

import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

// Chapter 07, the invitation. Back to ink; the core returns, hot and green.
// The install command runs past as a ticker in pixel type — the one line
// you need — on a solid band that crosses over the object, so it reads
// cleanly wherever the core happens to sit.

export function BoardCta() {
  const run = Array.from({ length: 6 });
  return (
    <section
      id="board"
      data-chapter="07 Board"
      data-scene="board"
      className="relative z-10 flex min-h-svh flex-col justify-center overflow-hidden py-28"
    >
      <div className="px-4 md:px-10">
        <p className="label text-muted-foreground">[07] The board</p>
        <h2 data-board-head className="display mt-8 max-w-[14ch] text-[clamp(3.2rem,8.6vw,9.6rem)] text-paper">
          One board. Hours, <span className="text-signal">not spend.</span>
        </h2>
      </div>

      <div
        aria-hidden
        className="relative mt-14 border-y border-line bg-ink/90 py-4 backdrop-blur-sm"
      >
        <div className="marquee font-pixel text-[clamp(2.4rem,6vw,5.6rem)] leading-none text-paper/90">
          {[0, 1].map((copy) => (
            <span key={copy} className="flex shrink-0">
              {run.map((_, i) => (
                <span key={i} className="flex shrink-0 items-center gap-[0.5em] pr-[0.5em]">
                  <span className="text-signal">$</span> npx grindeasy
                  <span className="text-muted-foreground">✳</span>
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-14 grid gap-10 px-4 md:grid-cols-12 md:px-10">
        <p data-board-copy className="max-w-[46ch] text-[17px] leading-[1.5] text-muted-foreground md:col-span-5">
          Scored on active hours plus combos for running two tools in the same five-minute window.
          The agent self-reports; the server clamps. Synced every five minutes, weekly board resets
          on Monday.
        </p>
        <div data-board-copy className="flex flex-wrap items-center gap-6 md:col-span-5 md:col-start-8 md:justify-end">
          <Link href="/leaderboard" className="slab">
            Enter the leaderboard <span aria-hidden>→</span>
          </Link>
          <Link href="/leaderboard?range=weekly" className="bracket bg-ink/85 px-3 py-3 backdrop-blur-sm">
            This week
          </Link>
        </div>
      </div>
    </section>
  );
}

export function buildBoard(reduced: boolean) {
  const section = document.querySelector<HTMLElement>("#board")!;
  if (reduced) return () => {};

  const split = SplitText.create("[data-board-head]", { type: "lines", mask: "lines", linesClass: "line-mask" });
  gsap.from(split.lines, {
    yPercent: 110,
    duration: 1.3,
    stagger: 0.09,
    ease: "expo.out",
    scrollTrigger: { trigger: section, start: "top 65%" },
  });
  gsap.from("[data-board-copy]", {
    opacity: 0,
    y: 26,
    duration: 1,
    stagger: 0.1,
    ease: "expo.out",
    scrollTrigger: { trigger: section, start: "top 45%" },
  });

  // The footer wordmark climbs out of the bottom edge, letter by letter.
  const letters = gsap.utils.toArray<HTMLElement>("[data-footer-word] > span[aria-hidden]");
  gsap.from(letters, {
    yPercent: 100,
    duration: 1.1,
    stagger: 0.05,
    ease: "expo.out",
    scrollTrigger: { trigger: "[data-footer-word]", start: "top 95%" },
  });

  return () => split.revert();
}
