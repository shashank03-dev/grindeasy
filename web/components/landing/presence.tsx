"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { formatElapsed, scramble } from "@/components/site/motion";
import { DiscordCard } from "./discord-card";

gsap.registerPlugin(ScrollTrigger);

// Chapter 04, the card's whole life in four beats. The section pins; scroll
// walks the steps on the left, and the card on the right does what each step
// says — appears, takes a rank, picks up a second tool, clears. The elapsed
// timer is scroll: two hours and change across the pin.

const STEPS = [
  { k: "Appears", body: "A tracked tool goes active. The card shows up on your profile, no setup." },
  { k: "Ranks", body: "Your board rank and tier ride on it, and move while you work." },
  { k: "Combos", body: "Run two tools in the same five-minute window and both show. That's a combo." },
  { k: "Clears", body: "The tool goes quiet, the card goes with it. Nothing lingers." },
];

export function Presence() {
  return (
    <section
      id="presence"
      data-chapter="04 Card"
      data-scene="card"
      className="relative z-10 flex min-h-svh flex-col px-4 py-24 md:h-svh md:px-10 md:py-0 md:pt-28"
    >
      <p className="label text-muted-foreground">[04] Where it shows</p>
      <div className="mt-8 grid flex-1 gap-12 md:grid-cols-12 md:items-center md:pb-16">
        <div className="md:col-span-5">
          <h2 className="display text-[clamp(2.8rem,5.6vw,6rem)] text-paper">
            All of it lands on your profile.
          </h2>
          <ol className="mt-10 border-t border-line">
            {STEPS.map((step, i) => (
              <li
                key={step.k}
                data-step
                className="group/step relative grid grid-cols-[3rem_1fr] gap-x-4 border-b border-line py-4 before:absolute before:inset-y-0 before:-left-4 before:w-[2px] before:origin-top before:scale-y-0 before:bg-signal before:transition-transform before:duration-500 data-[active]:before:scale-y-100 md:before:-left-5"
              >
                <span className="font-pixel text-[15px] text-muted-foreground transition-colors duration-300 group-data-[active]/step:text-signal">
                  0{i + 1}
                </span>
                <div>
                  <p className="label text-muted-foreground transition-colors duration-300 group-data-[active]/step:text-paper">
                    {step.k}
                  </p>
                  <p className="mt-1.5 max-w-[42ch] text-[15px] leading-snug text-muted-foreground transition-colors duration-300 group-data-[active]/step:text-paper/90">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <div className="flex flex-col items-center gap-5 md:col-span-6 md:col-start-7">
          <div data-presence-card className="w-full max-w-[400px]">
            <DiscordCard />
          </div>
          <p data-presence-status className="label border border-line bg-ink/90 px-3 py-2 text-muted-foreground">
            discord · rich presence · live
          </p>
        </div>
      </div>
    </section>
  );
}

export function buildPresence(reduced: boolean) {
  const section = document.querySelector<HTMLElement>("#presence")!;

  const steps = gsap.utils.toArray<HTMLElement>("[data-step]", section);
  const card = section.querySelector<HTMLElement>("[data-presence-card]")!;
  const rows = gsap.utils.toArray<HTMLElement>("[data-card-row]", section);
  const timer = section.querySelector<HTMLElement>("[data-card-timer]")!;
  const activity = section.querySelector<HTMLElement>("[data-card-activity]")!;
  const rank = section.querySelector<HTMLElement>("[data-card-rank]")!;
  const status = section.querySelector<HTMLElement>("[data-presence-status]")!;

  if (reduced) return () => {};

  const RANK = "#12 on grindeasy · ◆ Platinum · PRO";
  let beat = -1;
  const setBeat = (b: number) => {
    if (b === beat) return;
    const prev = beat;
    beat = b;
    steps.forEach((s, i) => s.toggleAttribute("data-active", i === b));
    if (b >= 1 && prev < 1) scramble(rank, RANK, { duration: 0.6 });
    if (b < 1) rank.textContent = "· · ·";
    activity.textContent = b >= 2 ? "Claude Code + Codex" : "Claude Code";
    if (b === 2 && prev < 2) scramble(activity, "Claude Code + Codex", { duration: 0.5 });
    scramble(
      status,
      b === 3 ? "tool idle · card cleared" : b === 2 ? "combo · two tools, one window" : "discord · rich presence · live",
      { duration: 0.5 },
    );
  };
  setBeat(0);

  const clock = { t: 0 };
  timer.textContent = formatElapsed(0);
  // Wide screens pin and tell the story in place; on a phone the card stacks
  // under the steps, so the same timeline just scrubs across the section.
  const wide = window.innerWidth >= 768;
  const tl = gsap.timeline({
    defaults: { ease: "none" },
    scrollTrigger: {
      trigger: section,
      start: wide ? "top top" : "top 60%",
      end: wide ? "+=260%" : "bottom 40%",
      pin: wide,
      scrub: 0.6,
      onUpdate: (self) => setBeat(Math.min(3, Math.floor(self.progress * 4))),
    },
  });
  // The card must be readable for nearly the whole pin, so it assembles in
  // the first ~8% of it rather than across the first beat.
  tl.from(rows, { opacity: 0, y: 14, stagger: 0.012, duration: 0.05, ease: "power2.out" }, 0)
    .from(card, { rotateX: 28, rotateZ: -3, scale: 0.9, transformPerspective: 900, duration: 0.08 }, 0)
    .to(clock, { t: 8047, duration: 0.75, onUpdate: () => (timer.textContent = formatElapsed(clock.t)) }, 0)
    .to(card, { opacity: 0.85, scale: 0.96, filter: "grayscale(1)", duration: 0.12 }, 0.82)
    .to({}, { duration: 0.05 });

  return () => {};
}
