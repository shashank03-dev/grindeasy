"use client";

import Link from "next/link";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

// Chapter 06, the one paper chapter: the page turns the lights on to talk
// about data. The contract is written as a diff of the sync payload — what
// may be added if you opt in, and what is struck out for good. The strikes
// draw themselves as the block crosses the viewport.

const LEAVES = ["tool name", "active minutes", "combo count", "plan label", "discord handle"];
const NEVER = [
  "your code",
  "your prompts",
  "the model’s responses",
  "file names and paths",
  "api keys and auth tokens",
];

export function PrivacyDiff() {
  return (
    <section
      id="privacy"
      data-chapter="06 Privacy"
      data-scene="cage"
      className="relative z-20 bg-paper px-4 py-28 text-ink md:px-10 md:py-36"
    >
      <p className="label text-ink/55">[06] What leaves</p>
      <div className="mt-8 grid gap-14 md:grid-cols-12">
        <div className="md:col-span-5">
          <h2 data-privacy-head className="display text-[clamp(3rem,6.6vw,7.2rem)]">
            What leaves. What never does.
          </h2>
          <p className="mt-8 max-w-[44ch] text-[17px] leading-[1.5] text-ink/70">
            By default the agent talks to your Discord app and a dashboard on localhost, and
            nothing else. The board is opt-in, sends aggregate numbers only, and the whole thing
            is open source — check every line.
          </p>
          <Link href="/privacy" className="label link-u mt-8 inline-block text-ink">
            Read the full policy →
          </Link>
        </div>

        <div data-diff className="font-mono text-[14px] md:col-span-6 md:col-start-7 md:text-[15px]">
          <div className="flex items-center justify-between border border-b-0 border-ink/15 bg-ink/[0.04] px-4 py-2.5 text-[12px] text-ink/60">
            <span>sync.payload</span>
            <span>+5 −5</span>
          </div>
          <div className="border border-ink/15">
            <p className="bg-ink/[0.06] px-4 py-2 text-[12px] text-ink/55">
              @@ only if you join the board @@
            </p>
            {LEAVES.map((line) => (
              <p data-diff-add key={line} className="flex gap-4 bg-[#2f9e44]/[0.09] px-4 py-2">
                <span className="w-3 select-none text-[#1f7a32]">+</span>
                <span>{line}</span>
              </p>
            ))}
            <p className="bg-ink/[0.06] px-4 py-2 text-[12px] text-ink/55">
              @@ never · no opt-in exists @@
            </p>
            {NEVER.map((line) => (
              <p data-diff-del key={line} className="flex gap-4 bg-[#d6453a]/[0.08] px-4 py-2">
                <span className="w-3 select-none text-[#b3362c]">−</span>
                <span className="relative">
                  {line}
                  <span
                    data-strike
                    aria-hidden
                    className="absolute left-0 top-1/2 h-[1.5px] w-full origin-left bg-[#b3362c]"
                  />
                </span>
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function buildPrivacy(reduced: boolean) {
  const section = document.querySelector<HTMLElement>("#privacy")!;
  if (reduced) return () => {};

  const split = SplitText.create("[data-privacy-head]", { type: "lines", mask: "lines", linesClass: "line-mask" });
  gsap.from(split.lines, {
    yPercent: 110,
    duration: 1.2,
    stagger: 0.08,
    ease: "expo.out",
    scrollTrigger: { trigger: section, start: "top 70%" },
  });
  gsap.from("[data-diff-add], [data-diff-del]", {
    opacity: 0,
    x: -12,
    duration: 0.6,
    stagger: 0.05,
    ease: "power3.out",
    scrollTrigger: { trigger: "[data-diff]", start: "top 75%" },
  });
  gsap.fromTo(
    "[data-strike]",
    { scaleX: 0 },
    {
      scaleX: 1,
      stagger: 0.1,
      ease: "none",
      scrollTrigger: { trigger: "[data-diff]", start: "top 55%", end: "bottom 45%", scrub: 0.4 },
    },
  );

  return () => split.revert();
}
