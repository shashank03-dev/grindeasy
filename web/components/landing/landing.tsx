"use client";

import { useLayoutEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Cursor } from "@/components/site/cursor";
import { DitherField } from "@/components/site/dither-field";
import { scramble } from "@/components/site/motion";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { SmoothScroll } from "@/components/site/smooth-scroll";
import { BoardCta, buildBoard } from "./board-cta";
import { Boot, buildBoot } from "./boot";
import { Clock, buildClock } from "./clock";
import { Hero, buildHero } from "./hero";
import { Presence, buildPresence } from "./presence";
import { PrivacyDiff, buildPrivacy } from "./privacy-diff";
import { Scanner, buildScanner } from "./scanner";
import { SCENES, applyScene, resetReady } from "./scenes";
import { Tiers, buildTiers } from "./tiers";

gsap.registerPlugin(ScrollTrigger);

// grindeasy, told in seven chapters over one dithered screen.
//
//   01 Signal   the sentence, finished live by the tool it detects
//   02 Card     the Discord card's whole life, in four beats
//   03 Clock    the privacy model: it reads mtimes, never contents
//   04 Scan     the thirteen tools, stepped through like folders
//   05 Tiers    the ladder, sideways, from the real scoring module
//   06 Privacy  the sync payload as a diff, on paper
//   07 Board    the invitation
//
// Every chapter owns its markup and a build function for its choreography.
// They are built here in page order — ScrollTrigger needs pins created top
// to bottom — and only after the webfonts land, because every split line and
// pin distance is measured from set type.

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const chapterEl = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    let cancelled = false;
    let ctx: gsap.Context | undefined;
    const cleanups: Array<() => void> = [];
    resetReady();

    const build = () => {
      if (cancelled) return;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      ctx = gsap.context(() => {
        buildBoot();
        cleanups.push(
          buildHero(reduced),
          buildPresence(reduced),
          buildClock(reduced),
          buildScanner(reduced),
          buildTiers(reduced),
          buildPrivacy(reduced),
          buildBoard(reduced),
        );

        // One tracker for the whole page: whichever chapter (or the pin
        // spacer holding it) contains the viewport's centre owns the dither
        // field's pose and the chapter readout. Read from layout on every
        // update instead of per-section toggles, so a fast fling or a jump
        // link can never leave the object in the wrong chapter's shape.
        const chapters = gsap.utils.toArray<HTMLElement>("[data-chapter]");
        let current = "";
        const track = () => {
          const mid = window.innerHeight / 2;
          const hit = chapters.find((el) => {
            const r = (el.closest(".pin-spacer") ?? el).getBoundingClientRect();
            return r.top <= mid && r.bottom > mid;
          });
          // Past the last chapter (the footer) the readout steps aside, so it
          // never prints over the footer's own bottom line.
          chapterEl.current?.parentElement?.style.setProperty("opacity", hit ? "1" : "0");
          if (!hit || hit.dataset.chapter === current) return;
          current = hit.dataset.chapter!;
          applyScene(SCENES[hit.dataset.scene as keyof typeof SCENES]);
          const readout = chapterEl.current;
          if (!readout) return;
          if (reduced) readout.textContent = current;
          else scramble(readout, current, { duration: 0.5 });
        };
        ScrollTrigger.create({ start: 0, end: "max", onUpdate: track, onRefresh: track });
        track();
      }, root);
      ScrollTrigger.refresh();
    };

    void document.fonts.ready.then(build);

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
      ctx?.revert();
    };
  }, []);

  return (
    <div ref={root} className="relative">
      {/* Without JS nothing animates, so nothing may start hidden. */}
      <noscript>
        <style>{`[data-intro]{opacity:1!important}[data-boot]{display:none!important}`}</style>
      </noscript>

      {/* On phones the object shares the column with body copy, so there it
          prints softer and fades out by mid-screen: small text always lands
          on plain ink, only the big headlines cross the dither. */}
      <DitherField
        initial={{ ...SCENES.hero, reveal: 0 }}
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink max-md:opacity-60 max-md:[mask-image:linear-gradient(#000_22%,transparent_58%)]"
      />
      <div aria-hidden className="measure">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className={i >= 4 ? "hidden md:block" : undefined} />
        ))}
      </div>
      <div aria-hidden className="grain" />
      <Cursor />
      <SmoothScroll />
      <Boot />
      <SiteHeader />

      <p
        aria-hidden
        className="label pointer-events-none fixed bottom-4 right-4 z-40 hidden items-center gap-3 text-white mix-blend-difference transition-opacity duration-500 md:bottom-8 md:right-10 md:flex"
      >
        <span className="h-px w-10 bg-white/50" />
        <span ref={chapterEl}>01 Signal</span>
      </p>

      <main>
        <Hero />
        <Presence />
        <Clock />
        <Scanner />
        <Tiers />
        <PrivacyDiff />
        <BoardCta />
      </main>
      <SiteFooter />
    </div>
  );
}
