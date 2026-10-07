"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { hexToRgb, setField } from "@/components/site/dither-field";
import { COMBO_XP_HOURS, TIERS } from "@/lib/core/tiers";
import { TIER_HEX } from "@/lib/tier-colors";
import { SCENES, isActiveScene } from "./scenes";

gsap.registerPlugin(ScrollTrigger);

// Chapter 05. The ladder runs sideways: the section pins and vertical scroll
// slides five tier plates past, while the diamond in the field takes on each
// tier's color as its plate crosses centre. Thresholds come from the real
// scoring module, so this page cannot drift from the board.

const LINES: Record<string, string> = {
  Bronze: "Day one. Every account starts here.",
  Silver: "Ten hours in. You've stopped trying it out.",
  Gold: "Forty hours. It's how you work now.",
  Platinum: "A hundred hours of real, active time.",
  Diamond: "Two hundred and fifty. You live here.",
};

export function Tiers() {
  return (
    <section
      id="tiers"
      data-chapter="05 Tiers"
      data-scene="tiers"
      className="group/tiers relative z-10 h-svh overflow-hidden data-[static]:h-auto data-[static]:py-24"
    >
      <div
        data-tier-track
        className="flex h-full w-max items-stretch gap-4 px-4 pb-10 pt-24 md:gap-6 md:px-10 md:pt-28 group-data-[static]/tiers:w-auto group-data-[static]/tiers:flex-col"
      >
        <div className="flex w-[84vw] shrink-0 flex-col justify-between md:w-[38vw] group-data-[static]/tiers:w-auto">
          <p className="label text-muted-foreground">[05] The ladder</p>
          <div>
            <h2 className="display text-[clamp(3rem,6.4vw,7rem)] text-paper">
              Five tiers. Earned in hours.
            </h2>
            <p className="mt-8 max-w-[40ch] text-[16px] leading-[1.5] text-muted-foreground">
              XP is active hours, plus a quarter hour for every combo. Your plan shows on the card
              as context and never weights a thing.
            </p>
            <p className="mt-8 inline-flex flex-wrap items-baseline gap-x-3 gap-y-1 border border-line px-4 py-3 font-mono text-[14px] text-paper">
              <span className="text-signal">XP</span> = hours + {COMBO_XP_HOURS} × combos
            </p>
          </div>
        </div>

        {TIERS.map((tier, i) => (
          <article
            key={tier.name}
            data-tier={tier.name}
            className="relative flex w-[84vw] shrink-0 flex-col justify-between border border-line bg-ink/88 p-5 backdrop-blur-md md:w-[44vw] md:p-8 group-data-[static]/tiers:w-auto"
            style={{ ["--tier" as string]: TIER_HEX[tier.name] }}
          >
            <div className="label flex items-center justify-between text-muted-foreground">
              <span>
                T{i + 1} / {TIERS.length}
              </span>
              <span className="text-[18px] text-[var(--tier)]" aria-hidden>
                {tier.glyph}
              </span>
            </div>
            <div className="py-10">
              <h3 className="font-pixel text-[clamp(3.4rem,8.4vw,9rem)] leading-[0.85] tracking-[-0.03em] text-[var(--tier)]">
                {tier.name}
              </h3>
              <p className="mt-6 max-w-[34ch] text-[16px] leading-snug text-paper/80">
                {LINES[tier.name]}
              </p>
            </div>
            <div className="flex items-end justify-between gap-4 border-t border-line pt-4">
              <span className="label text-muted-foreground">from</span>
              <span className="font-dot text-[clamp(2rem,4vw,3.6rem)] leading-none tabular-nums text-paper">
                {tier.xp}
                <span className="ml-2 font-mono text-[0.3em] text-muted-foreground">XP</span>
              </span>
            </div>
          </article>
        ))}
        <div aria-hidden className="w-[6vw] shrink-0 group-data-[static]/tiers:hidden" />
      </div>
    </section>
  );
}

export function buildTiers(reduced: boolean) {
  const section = document.querySelector<HTMLElement>("#tiers")!;
  const track = section.querySelector<HTMLElement>("[data-tier-track]")!;
  const plates = gsap.utils.toArray<HTMLElement>("[data-tier]", section);

  if (reduced) {
    section.dataset.static = "";
    return () => {
      delete section.dataset.static;
    };
  }

  const distance = () => track.scrollWidth - window.innerWidth;
  // The plate nearest the viewport centre owns the field's color. Measured
  // in the tween's own onUpdate — it runs every frame of the scrub, so the
  // reading is of where the track actually is, not where scroll will take it.
  const lightNearest = () => {
    // The scrub keeps easing after scroll leaves the chapter; once the page
    // has moved to another scene, this must not repaint the field.
    if (!isActiveScene(SCENES.tiers)) return;
    const mid = window.innerWidth / 2;
    let best = plates[0]!;
    let bestD = Infinity;
    for (const p of plates) {
      const r = p.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - mid);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    const progress = tween.progress();
    // Written every frame rather than on change: the page's scene tracker
    // resets the tint whenever this chapter is re-entered.
    const name = progress < 0.08 ? "" : best.dataset.tier!;
    setField({
      tint: name ? hexToRgb(TIER_HEX[name]!) : [...SCENES.tiers.tint],
      spin: progress * Math.PI * 2,
    });
  };
  const tween = gsap.to(track, {
    x: () => -distance(),
    ease: "none",
    onUpdate: lightNearest,
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: () => `+=${distance()}`,
      pin: true,
      scrub: 0.7,
      invalidateOnRefresh: true,
    },
  });

  return () => tween.kill();
}
