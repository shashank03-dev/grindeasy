"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { pad } from "@/components/site/motion";

gsap.registerPlugin(ScrollTrigger, SplitText);

// Chapter 03, the whole privacy model in one sentence. Scroll brings the
// words up one at a time as the chapter arrives, while beneath it a real
// mtime — this page's own clock, to the millisecond — keeps changing. That
// number is the only thing the agent ever looks at.

export function Clock() {
  return (
    <section
      id="clock"
      data-chapter="03 Clock"
      data-scene="clock"
      className="relative z-10 flex min-h-svh flex-col justify-center px-4 py-24 md:px-10"
    >
      <p className="label text-muted-foreground">[03] How it knows</p>
      <h2
        data-clock-statement
        className="display mt-8 max-w-[13ch] text-[clamp(3.2rem,9.6vw,10.5rem)] text-paper"
      >
        It reads the clock. <span className="text-signal">Not the file.</span>
      </h2>
      <div className="mt-14 grid gap-8 md:grid-cols-12">
        <p data-clock-copy className="max-w-[46ch] text-[17px] leading-[1.5] text-muted-foreground md:col-span-5">
          Every AI coding tool writes session files as it works. grindeasy decides a tool is
          active from one signal only: <span className="text-paper">when those files last changed</span>.
          It never opens them. It doesn’t need to.
        </p>
        <div data-clock-copy className="flex flex-col gap-2 md:col-span-4 md:col-start-9">
          <span className="label text-muted-foreground">st_mtime · newest file</span>
          <span data-mtime className="font-dot text-[clamp(1.6rem,3.2vw,2.6rem)] tabular-nums text-paper">
            00:00:00.000
          </span>
          <span className="label text-muted-foreground">contents · never read</span>
        </div>
      </div>
    </section>
  );
}

export function buildClock(reduced: boolean) {
  const section = document.querySelector<HTMLElement>("#clock")!;

  // The mtime readout runs regardless of motion preference — it is data, not
  // decoration — but only while the chapter is on screen.
  const mtime = section.querySelector<HTMLElement>("[data-mtime]")!;
  let raf = 0;
  const tick = () => {
    const d = new Date();
    mtime.textContent = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
    raf = requestAnimationFrame(tick);
  };
  const io = new IntersectionObserver(([entry]) => {
    cancelAnimationFrame(raf);
    if (entry?.isIntersecting) raf = requestAnimationFrame(tick);
  });
  io.observe(mtime);

  if (reduced) {
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }

  const split = SplitText.create("[data-clock-statement]", { type: "words" });
  // The words light while the chapter scrolls in, from a floor that is
  // already legible, so the sentence is never ghost text on its way up.
  gsap.fromTo(
    split.words,
    { opacity: 0.28 },
    {
      opacity: 1,
      stagger: 0.12,
      ease: "none",
      scrollTrigger: { trigger: section, start: "top 85%", end: "top 10%", scrub: 0.4 },
    },
  );
  // The copy arrives once, quickly, as it reaches the screen — never parked
  // half-transparent while a scrub catches up.
  gsap.from("[data-clock-copy]", {
    opacity: 0,
    y: 24,
    duration: 0.9,
    stagger: 0.1,
    ease: "expo.out",
    scrollTrigger: { trigger: "[data-clock-copy]", start: "top 92%" },
  });

  return () => {
    io.disconnect();
    cancelAnimationFrame(raf);
    split.revert();
  };
}
