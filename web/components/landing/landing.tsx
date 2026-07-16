"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { DiscordCard } from "./discord-card";
import { FinaleInfall } from "./finale-infall";
import { Magnetic, RollText } from "./interactive";
import { Mark } from "./mark";
import { LandingStage, stageState } from "./stage";
import { TOOL_MARKS } from "./tool-data";
import { hasWebGL } from "@/lib/webgl";

gsap.registerPlugin(ScrollTrigger, SplitText, ScrollSmoother);

// "Alone with the machine." The hero photograph — one figure at a desk in a
// black void — is the theme; the whole page lives in its cold light. The
// photo runs as an interactive particle field, dissolves on scroll into the
// first tool's mark, and hands over to the metal tools section; the privacy
// section then curtains over it. Spec: docs/superpowers/specs/
// 2026-07-14-landing-molten-rework-design.md.

const HERO_LINES = ["See what you’re", "coding with."];

// What the agent sends if you opt in — and the whole point: it fits in one hand.
const LEAVES = ["Tool name", "Active minutes", "Combo count", "Plan label", "Discord handle"];

// What it can't send, because it never reads it. Each row gets struck through.
const NEVER_LEAVES = [
  "Your code",
  "Your prompts",
  "The model’s responses",
  "File names and paths",
  "API keys and auth tokens",
];

function formatElapsed(totalSeconds: number): string {
  const s = Math.floor(totalSeconds);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

const tintCss = (t: [number, number, number]) =>
  `rgb(${Math.round(t[0] * 255)} ${Math.round(t[1] * 255)} ${Math.round(t[2] * 255)})`;

// The DOM rendition of a tool mark: the static twin of the WebGL metal plane,
// visible whenever the stage isn't (no WebGL, reduced motion, JS off).
function FallbackMark({ tool }: { tool: (typeof TOOL_MARKS)[number] }) {
  return (
    <div data-gl-fallback className="absolute inset-0">
      {tool.path ? (
        <svg viewBox="0 0 24 24" aria-hidden className="h-full w-full p-[16%]">
          <path d={tool.path} fill="url(#metal-grad)" />
        </svg>
      ) : (
        <div className="grid h-full w-full place-items-center">
          <span
            className="metal-text font-caps text-[clamp(1.6rem,5.5vmin,3.2rem)] tracking-[0.14em]"
            style={{ "--tint": tintCss(tool.tint) } as React.CSSProperties}
          >
            {tool.code}
          </span>
        </div>
      )}
    </div>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  const copyInstall = () => {
    void navigator.clipboard?.writeText("npx grindeasy").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  useLayoutEffect(() => {
    let ctx: gsap.Context | undefined;
    let cancelled = false;

    // Returning visitors skip the loader — decided before fonts, so it never
    // flashes while we wait for them.
    const loaderSeen = sessionStorage.getItem("ge-loader") === "1";
    if (loaderSeen) gsap.set("[data-loader]", { display: "none" });

    // The display faces are local webfonts that swap in after first paint and
    // change the height of every block on the page. Splitting lines and
    // measuring trigger positions before that lands leaves ScrollTrigger
    // holding values for a page that no longer exists — so nothing is built
    // until the fonts are actually in.
    const build = () => {
      if (cancelled) return;
      ctx = gsap.context(() => {
        const mm = gsap.matchMedia();

        // Every scroll-driven scene on the page, shared by both motion paths:
        // the owner wants the full scroll story — the tools wheel included —
        // under reduced motion too. What that path drops is the loader, the
        // smoothing, the particle field, and the hero-pin morph; the page
        // itself animates the same. Scenes are created in page order so
        // ScrollTrigger refreshes them top to bottom.
        const buildScrollScenes = () => {
          // Seam name: the specular slides across the metal exactly as fast
          // as the name crosses the viewport. Scroll is the light.
          gsap.utils.toArray<HTMLElement>("[data-tool-name]").forEach((el) => {
            gsap.fromTo(
              el,
              { "--shine": -0.25 },
              {
                "--shine": 1.25,
                ease: "none",
                scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: true },
              },
            );
          });

          // The wheel — valeran's MWG040 motion, mechanics taken from its
          // live JS: each item is the full circle box pre-rotated i·14.5°,
          // its child counter-rotated to stay level; scroll scrubs every
          // circle through -(180 + 14.5·n)° while the stage is pinned, and
          // the children take the inverse so names and marks orbit without
          // ever tilting.
          const wheelPin = document.querySelector<HTMLElement>("[data-wheel-pin]");
          const wheelStage = document.querySelector<HTMLElement>("[data-wheel-stage]");
          const left = document.querySelector<HTMLElement>("[data-wheel-circle-left]");
          const right = document.querySelector<HTMLElement>("[data-wheel-circle-right]");
          if (wheelPin && wheelStage && left && right) {
            const ANGLE = 14.5;
            const leftItems = gsap.utils.toArray<HTMLElement>(".wheel-item", left);
            const rightItems = gsap.utils.toArray<HTMLElement>(".wheel-item", right);
            const labels = leftItems.map((el) => el.querySelector<HTMLElement>(".wheel-label")!);
            // No dead scroll at either end: the circles start pre-rotated so
            // the first item is already at the viewport's edge when the pin
            // engages (an item is on screen for roughly ±45° around the -90°
            // mouth), and the sweep stops once the last item has cleared.
            const START = -24;
            const END = -(90 + ANGLE * (leftItems.length - 1) + 55);
            const sweep = START - END;
            gsap.set([left, right], { rotation: START });
            leftItems.forEach((el, i) => {
              gsap.set(el, { rotation: i * ANGLE });
              gsap.set(labels[i]!, { rotation: -i * ANGLE - START });
            });
            const media = rightItems.map((el) => el.querySelector<HTMLElement>(".wheel-media")!);
            rightItems.forEach((el, i) => {
              gsap.set(el, { rotation: i * ANGLE });
              gsap.set(media[i]!, { rotation: -i * ANGLE - START });
            });
            // Near the circle's top the marks sit shoulder to shoulder — still
            // inside the stage box, so clipping can't hide the pile. Each mark
            // fades in only as it swings down toward the mouth (visible band
            // ~56–128° for the right circle) and out again as it leaves. The
            // WebGL pass reads this opacity off the element every frame.
            const fadeMedia = () => {
              const rot = Number(gsap.getProperty(right, "rotation"));
              media.forEach((m, i) => {
                const d = i * ANGLE + rot + 180;
                m.style.opacity = String(
                  gsap.utils.clamp(0, 1, Math.min((140 - d) / 12, (d - 42) / 12)),
                );
              });
            };
            fadeMedia();
            const scrollConfig = {
              trigger: wheelPin,
              start: "top top",
              end: "bottom bottom",
              scrub: true,
            };
            gsap.to(left, {
              rotation: END,
              ease: "none",
              scrollTrigger: {
                ...scrollConfig,
                pin: wheelStage,
                // Never position:fixed — the curtain tween puts a transform on
                // [data-tools-inner], which would become fixed's containing
                // block and glue the stage to the section instead of the
                // viewport. (The smoother path implies this; the reduced-
                // motion native-scroll path needs it said.)
                pinType: "transform",
                onUpdate: () => {
                  // The labels' shine rides the same rotation: world angle
                  // -90° is the wheel's mouth where a name reads level, and
                  // the specular makes its full travel across ±25° of it.
                  const rot = Number(gsap.getProperty(left, "rotation"));
                  labels.forEach((label, i) => {
                    const world = i * ANGLE + rot;
                    label.style.setProperty(
                      "--shine",
                      String(gsap.utils.clamp(-0.25, 1.25, 0.5 + (world + 90) / 50)),
                    );
                  });
                },
              },
            });
            gsap.to(labels, {
              rotation: `+=${sweep}`,
              ease: "none",
              scrollTrigger: { ...scrollConfig },
            });
            gsap.to(right, {
              rotation: END,
              ease: "none",
              scrollTrigger: { ...scrollConfig, onUpdate: fadeMedia },
            });
            gsap.to(right.querySelectorAll(".wheel-media"), {
              rotation: `+=${sweep}`,
              ease: "none",
              scrollTrigger: { ...scrollConfig },
            });
          }

          // Finale: the Discord card assembles and its timer runs up as it
          // crosses the viewport — the thirteen tools funnel into this one card.
          const clock = { t: 0 };
          const timerEl = document.querySelector<HTMLElement>("[data-act-card] [data-card-timer]");
          if (timerEl) timerEl.textContent = formatElapsed(0);
          gsap
            .timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: "[data-finale]",
                start: "top 85%",
                end: "center center",
                scrub: 1,
              },
            })
            .from("[data-act-card]", { scale: 0.84, rotate: -4, opacity: 0.25 })
            .to(
              clock,
              {
                t: 8047,
                onUpdate: () => {
                  if (timerEl) timerEl.textContent = formatElapsed(clock.t);
                },
              },
              0,
            );

          // The curtain: the tools section pins in place (no spacer) and the
          // privacy section rides straight over it, while everything beneath
          // dims and falls back.
          ScrollTrigger.create({
            trigger: "#tools",
            start: "bottom bottom",
            end: "+=100%",
            pin: true,
            pinSpacing: false,
          });
          gsap.to("[data-tools-inner]", {
            opacity: 0.15,
            scale: 0.94,
            yPercent: -4,
            ease: "none",
            scrollTrigger: {
              trigger: "#privacy",
              start: "top bottom",
              end: "top top",
              scrub: true,
            },
          });

          // Statement: characters climb out of the mask as the block crosses centre.
          const statement = SplitText.create("[data-statement]", {
            type: "chars,lines",
            mask: "lines",
          });
          // The editorial face's ascenders (the f's hook) overshoot the line
          // box, and the line masks clip them — "file" read as "tile". Give
          // each mask headroom, cancelled by margin so the leading is
          // untouched; bottom stays flush so entering chars stay hidden.
          gsap.set(statement.masks, { paddingTop: "0.18em", marginTop: "-0.18em" });
          gsap.from(statement.chars, {
            yPercent: 120,
            stagger: 0.012,
            ease: "expo.out",
            duration: 1,
            scrollTrigger: { trigger: "[data-statement]", start: "top 78%" },
          });

          // Hand-drawn decorations (the circle, the underline) draw themselves in.
          gsap.utils.toArray<SVGPathElement>("[data-draw]").forEach((path) => {
            gsap.to(path, {
              strokeDashoffset: 0,
              duration: 1.1,
              ease: "power2.inOut",
              scrollTrigger: { trigger: path, start: "top 78%" },
            });
          });

          // The never-leaves ledger cancels itself line by line.
          gsap.to("[data-strike]", {
            scaleX: 1,
            duration: 0.7,
            stagger: 0.14,
            ease: "power2.inOut",
            scrollTrigger: { trigger: "[data-ledger]", start: "top 65%" },
          });

          // Footer: the wordmark climbs out of the baseline one letter at a
          // time. The letters are the roll-hover's own char spans, which carry
          // a CSS transform transition — it would smear every GSAP frame, so
          // it's off for the intro and restored (a frame after the transform
          // is cleared, or the restore itself would animate) for hover.
          const brandChars = gsap.utils.toArray<HTMLElement>("[data-footer-brand] .roll-char");
          gsap.set(brandChars, { transition: "none" });
          gsap.from(brandChars, {
            yPercent: 110,
            duration: 1.1,
            stagger: 0.045,
            ease: "expo.out",
            scrollTrigger: { trigger: "[data-footer-brand]", start: "top 92%" },
            onComplete: () => {
              gsap.set(brandChars, { clearProps: "transform" });
              requestAnimationFrame(() =>
                requestAnimationFrame(() => gsap.set(brandChars, { clearProps: "transition" })),
              );
            },
          });

          // Everything else just arrives.
          ScrollTrigger.batch("[data-reveal]", {
            start: "top 85%",
            onEnter: (batch) =>
              gsap.to(batch, {
                opacity: 1,
                y: 0,
                duration: 1,
                stagger: 0.09,
                ease: "expo.out",
              }),
          });

          return () => statement.revert();
        };

        // Reduced motion: no loader hold, no scroll hijack, no particles (the
        // stage runs background-only), no hero pin — but the scroll scenes
        // themselves still play, on native scroll.
        mm.add("(prefers-reduced-motion: reduce)", () => {
          gsap.set("[data-loader]", { display: "none" });
          gsap.set("[data-hero-line]", { opacity: 1 });
          const teardownScenes = buildScrollScenes();
          return teardownScenes;
        });

        mm.add("(prefers-reduced-motion: no-preference)", () => {
          const smoother = ScrollSmoother.create({
            wrapper: "#smooth-wrapper",
            content: "#smooth-content",
            smooth: 1.1,
            effects: true,
            normalizeScroll: true,
          });

          // Hero: lines rise out of their own mask.
          const heads = gsap.utils.toArray<HTMLElement>("[data-hero-line]");
          const splits = heads.map((el) => SplitText.create(el, { type: "lines", mask: "lines" }));
          // Headroom both ways: at leading 0.94 the caps overshoot the line box
          // upward (em box overflow + the face's own cap overshoot) and the
          // swash descenders (the y, the g) overshoot it below — short either
          // pair and the masks shave the glyphs flat.
          splits.forEach((s) =>
            gsap.set(s.masks, {
              paddingTop: "0.32em",
              marginTop: "-0.32em",
              paddingBottom: "0.3em",
              marginBottom: "-0.3em",
            }),
          );
          // The metal goes on the split's line elements — they hold the glyphs
          // directly, which background-clip:text requires. Inline --tint and
          // --shine, because .metal-text's own defaults would shadow anything
          // inherited from the heading.
          const heroLines = splits.flatMap((s) => s.lines) as HTMLElement[];
          heroLines.forEach((l) => l.classList.add("metal-text", "metal-bright"));
          gsap.set(heroLines, { "--tint": "#dfe6ee" });
          gsap.set(heads, { opacity: 1 });

          const intro = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } });
          intro
            // 165, not 115: the masks open 0.3em below the line box for the
            // descenders, and the caps overshoot the line box top — the hiding
            // spot has to clear both or cap tops peek through the opened
            // window before the rise.
            .from(
              splits.flatMap((s) => s.lines),
              { yPercent: 165, duration: 1.25, stagger: 0.09 },
            )
            // One specular pass over the heading as it lands — the metal
            // announcing itself — settling just left of centre.
            .fromTo(
              heroLines,
              { "--shine": -0.25 },
              { "--shine": 0.55, duration: 2.2, ease: "power2.inOut" },
              0.35,
            )
            .from("[data-hero-eyebrow]", { opacity: 0, duration: 0.6 }, 0.15)
            .from("[data-hero-sub]", { opacity: 0, y: 24, duration: 0.9 }, 0.5)
            .from(
              "[data-hero-actions] > *",
              { opacity: 0, y: 20, duration: 0.8, stagger: 0.08 },
              0.65,
            )
            .from("[data-hero-cue]", { opacity: 0, duration: 0.6 }, 1);

          // After the intro settles, the light keeps living: every few seconds
          // a specular pass slides off the right edge, resets off-glyph on the
          // left (both ends are dark, so the jump is invisible), and sweeps
          // back to the intro's resting point.
          gsap
            .timeline({ repeat: -1, repeatDelay: 4.5, delay: 6.5 })
            .to(heroLines, { "--shine": 1.6, duration: 1.3, ease: "power2.in" })
            .set(heroLines, { "--shine": -0.5 })
            .to(heroLines, { "--shine": 0.55, duration: 1.7, ease: "power2.out" });

          // Loader: the mark blurs in over black, holds a beat, blurs out;
          // scroll stays locked until it clears. Once per session.
          if (loaderSeen) {
            intro.play();
          } else {
            smoother.paused(true);
            gsap
              .timeline({
                onComplete: () => {
                  sessionStorage.setItem("ge-loader", "1");
                  smoother.paused(false);
                },
              })
              .from("[data-loader-brand]", {
                filter: "blur(10px)",
                y: 8,
                opacity: 0,
                duration: 0.85,
                ease: "expo.out",
              })
              // The hero starts rising behind the loader's fade rather than
              // after it — the page reads as arriving, not as waiting twice.
              .add(() => intro.play(), "+=0.35")
              .to("[data-loader-brand]", {
                filter: "blur(10px)",
                opacity: 0,
                duration: 0.5,
                ease: "expo.in",
              })
              .to("[data-loader]", { autoAlpha: 0, duration: 0.4 }, "<0.2")
              .set("[data-loader]", { display: "none" });
          }

          // The morph: hero pinned while the photograph's particles stream out
          // and re-form as the first tool's mark, hold it, then lift away —
          // the seam into the tools section. stageState is read by the WebGL
          // loop every frame. Without WebGL there is no morph to give the pin
          // its 170% — holding that length would be 1.7 viewports of black —
          // so the static path keeps only a short beat for the image dissolve.
          const glCapable = hasWebGL();
          const morphTl = gsap
            .timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: "#hero",
                start: "top top",
                end: glCapable ? "+=170%" : "+=45%",
                pin: true,
                scrub: 1,
              },
            })
            .to("[data-hero-content]", { opacity: 0, yPercent: -14, duration: 0.28 }, 0)
            .to("[data-hero-cue]", { opacity: 0, duration: 0.2 }, 0)
            .to("[data-hero-scrim]", { opacity: 0, duration: 0.32 }, 0)
            .to("[data-hero-img]", { opacity: 0, duration: 0.4 }, 0.05);
          if (glCapable) {
            morphTl.to(stageState, { morph: 1, duration: 0.75 }, 0.08);

            // The handoff: the formed mark holds until the seam row actually
            // arrives, then thins away exactly while the metal version rises to
            // centre — no dead viewport between pin release and the section.
            gsap.to(stageState, {
              heroAlpha: 0,
              ease: "none",
              scrollTrigger: {
                trigger: "#tools",
                start: "top bottom",
                end: "top top",
                scrub: true,
              },
            });
          }

          // Everything scroll-driven from the tools seam down is shared with
          // the reduced-motion path — built once, above.
          const teardownScenes = buildScrollScenes();

          return () => {
            splits.forEach((s) => s.revert());
            teardownScenes();
            smoother.kill();
          };
        });
      }, root);
    };

    void document.fonts.ready.then(build);

    return () => {
      cancelled = true;
      ctx?.revert();
    };
  }, []);

  // Cursor parallax for the aurora curtain: lean the whole layer a few px
  // toward the pointer. Written straight to CSS vars the .aurora transform
  // reads (inherited down from the landing root) — no React state, no
  // re-render per move. The position eases toward the target in a rAF loop
  // that stops once it settles, so it glides instead of snapping.
  useLayoutEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = root.current;
    if (!el) return;
    let raf = 0;
    let curX = 0;
    let curY = 0;
    let tgtX = 0;
    let tgtY = 0;
    const tick = () => {
      curX += (tgtX - curX) * 0.08;
      curY += (tgtY - curY) * 0.08;
      el.style.setProperty("--aurora-x", `${curX.toFixed(2)}px`);
      el.style.setProperty("--aurora-y", `${curY.toFixed(2)}px`);
      raf =
        Math.abs(tgtX - curX) > 0.1 || Math.abs(tgtY - curY) > 0.1
          ? requestAnimationFrame(tick)
          : 0;
    };
    const onMove = (e: MouseEvent) => {
      tgtX = (e.clientX / window.innerWidth - 0.5) * 26;
      tgtY = (e.clientY / window.innerHeight - 0.5) * 14;
      if (!raf) raf = requestAnimationFrame(tick);
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div ref={root} data-landing>
      {/* Without JS nothing animates, so nothing may start hidden. */}
      <noscript>
        <style>{`[data-reveal],[data-hero-line]{opacity:1!important;transform:none!important}[data-loader]{display:none!important}[data-strike]{transform:scaleX(1)!important}[data-draw]{stroke-dashoffset:0!important}`}</style>
      </noscript>

      {/* Shared gradient for the static metal marks. */}
      <svg aria-hidden className="absolute h-0 w-0">
        <defs>
          <linearGradient id="metal-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#eaf0f7" />
            <stop offset="0.42" stopColor="#8b95a3" />
            <stop offset="0.58" stopColor="#f6f9fc" />
            <stop offset="0.78" stopColor="#6d7684" />
            <stop offset="1" stopColor="#4e555f" />
          </linearGradient>
        </defs>
      </svg>

      {/* Fixed chrome lives outside the smoothed content: ScrollSmoother
          transforms #smooth-content, and position:fixed inside a transformed
          ancestor silently becomes "scrolls away with the page". */}
      <LandingStage />
      <div aria-hidden className="light-pool" />
      {/* Page-wide aurora curtain — see .aurora in globals.css. Four soft
          light shafts, cursor-parallaxed, riding over the opaque sections. */}
      <div aria-hidden className="aurora">
        <span className="aurora__beam aurora__beam--1" />
        <span className="aurora__beam aurora__beam--2" />
        <span className="aurora__beam aurora__beam--3" />
        <span className="aurora__beam aurora__beam--4" />
      </div>
      <div aria-hidden className="noise" />

      {/* Loader: brand over black, blur-in → hold → blur-out, once per session. */}
      <div data-loader className="fixed inset-0 z-[95] grid place-items-center bg-background">
        <div data-loader-brand className="flex items-center gap-3.5">
          <Mark className="h-9 w-9" />
          <span className="font-caps text-[15px] uppercase tracking-[0.34em] text-foreground">
            grindeasy
          </span>
        </div>
      </div>

      <header className="fixed inset-x-0 top-0 z-50 flex items-center justify-between px-6 py-5 mix-blend-difference sm:px-10">
        <Link href="/" data-roll className="flex items-center gap-2.5">
          <Mark className="h-6 w-6" />
          <RollText
            text="grindeasy"
            className="font-caps text-[12px] uppercase tracking-[0.26em] text-white"
          />
        </Link>
        <Link
          href="/leaderboard"
          data-roll
          className="font-caps text-[12px] uppercase tracking-[0.26em] text-white"
        >
          <RollText text="The board" />
        </Link>
      </header>

      <div id="smooth-wrapper">
        <div id="smooth-content">
          {/* ── Hero: the photograph, particle-borne ─────────────────────── */}
          {/* The hero is built on the golden section: bottom padding of
              38.2svh minus the actions row's own height pins that row's top
              edge to the 61.8 line, and the copy block centres in what
              remains, which lands its optical centre near the upper golden
              line — no magic offsets, the proportions come from the frame.
              On phones the construction relaxes to a plain stack with room
              for the scroll cue. */}
          <section
            id="hero"
            className="relative z-10 flex min-h-svh flex-col overflow-hidden px-6 pb-36 pt-28 sm:px-10 sm:pb-[calc(38.2svh-3.4rem)]"
          >
            {/* The static photograph: the LCP, and the whole hero when WebGL
                is unavailable. The outer layer is CSS-hidden once the particle
                field is live; the inner img is what the morph scrub fades on
                the static path. */}
            <div data-gl-fallback className="absolute inset-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                data-hero-img
                src="/landing/hero.jpg"
                alt="A lone developer at a desk under a single cold light, screens glowing in a black void."
                fetchPriority="high"
                className="h-full w-full object-cover [filter:saturate(1.14)_contrast(1.05)]"
              />
            </div>
            {/* Both carry data-hero-scrim so the morph scrub fades them as one. */}
            <div data-hero-scrim aria-hidden className="hero-grade absolute inset-0" />
            <div data-hero-scrim aria-hidden className="scrim-b absolute inset-x-0 bottom-0 h-[62%]" />

            {/* Everything stays in the left column — copy and actions both —
                so the photograph's subject keeps the lower right of the frame
                entirely to itself. */}
            <div data-hero-content className="relative mx-auto flex w-full max-w-[1400px] flex-1 flex-col">
              {/* pb-6 and no more: it's the minimum sub-to-actions gap, but any
                  height the copy group adds past the viewport pushes the whole
                  section — and the actions row — below the golden line. */}
              {/* translate, not padding, to sit the copy a touch lower: a
                  transform adds no layout height, so the golden-line math on
                  the section's bottom padding stays untouched. */}
              <div className="flex flex-1 translate-y-4 flex-col justify-center pb-6 sm:translate-y-7">
                <p
                  data-hero-eyebrow
                  className="font-caps text-[11px] uppercase tracking-[0.34em] text-muted-foreground"
                >
                  Local agent · v0.5.0 · MIT
                </p>

              {/* The heading becomes the same struck metal as the tool names
                  once SplitText runs — the classes go on the split's own line
                  elements in the intro setup, because background-clip:text dies
                  the moment a wrapper div sits between it and the glyphs. On
                  the non-splitting paths (reduced motion, JS off) this stays
                  plain foreground text. */}
              {/* flex column, not plain blocks: the SplitText masks carry
                  padding + negative-margin pairs that must cancel to zero, and
                  between block siblings the negative margins would collapse to
                  the most negative one instead of summing — flex items never
                  collapse margins. */}
              <h1
                data-hero-head
                className="mt-5 flex flex-col font-editorial text-[clamp(3rem,9vw,9rem)] leading-[0.94] tracking-[-0.01em] text-foreground"
              >
                {HERO_LINES.map((line) => (
                  <span key={line} data-hero-line className="block opacity-0">
                    {line}
                  </span>
                ))}
              </h1>

                <p
                  data-hero-sub
                  className="mt-9 max-w-[46ch] text-[16px] leading-relaxed text-muted-foreground"
                >
                  A tiny local agent that puts the AI tool you’re actually using on your Discord
                  profile,{" "}
                  <span className="font-serif text-[1.2em] italic text-foreground/85">
                    live while you work.
                  </span>{" "}
                  <span className="font-serif text-[1.2em] italic text-foreground">
                    It never reads your code.
                  </span>
                </p>
              </div>

              <div data-hero-actions className="flex flex-wrap items-center gap-5">
                  {/* Deliberately static — no magnet, no roll. It's the command
                      you're about to copy; it should hold still like one. */}
                  <button
                    type="button"
                    onClick={copyInstall}
                    className="flex items-center gap-3 rounded-full border border-input bg-background/50 px-6 py-4 font-mono text-[14px] text-foreground backdrop-blur-sm transition-colors hover:border-primary"
                  >
                    <span className="text-primary">$</span>
                    <span>npx grindeasy</span>
                    <span className="ml-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                      {copied ? "copied" : "copy"}
                    </span>
                  </button>

                  <Magnetic>
                    <Link
                      href="/leaderboard"
                      data-roll
                      className="flex items-center gap-2.5 font-caps text-[12px] uppercase tracking-[0.24em] text-foreground"
                    >
                      <RollText text="See the board" />
                      <span data-mag="0.55" aria-hidden>
                        →
                      </span>
                    </Link>
                  </Magnetic>
              </div>
            </div>

            {/* Outside data-hero-content: the copy block is golden-section
                built now, but the cue still belongs to the bottom edge. The
                hairline above it drops a dot over and over — the page's one
                standing invitation to scroll. */}
            <div
              data-hero-cue
              className="absolute inset-x-0 bottom-8 flex flex-col items-center gap-4"
            >
              <span aria-hidden className="cue-line" />
              <p className="text-center font-caps text-[10px] uppercase tracking-[0.4em] text-muted-foreground">
                Scroll — the picture comes apart
              </p>
            </div>
          </section>

          {/* ── The tools, in metal ──────────────────────────────────────── */}
          <section id="tools" className="relative z-10">
            <div data-tools-inner>
              {/* The seam: the particles have just re-formed as this mark. */}
              <div className="flex min-h-svh flex-col items-center justify-center gap-9 px-6 py-24 text-center">
                <p
                  data-reveal
                  className="translate-y-6 font-caps text-[11px] uppercase tracking-[0.34em] text-muted-foreground opacity-0"
                >
                  01 / The thirteen it watches
                </p>
                <div
                  data-metal-anchor="0"
                  className="relative aspect-square w-[min(50vmin,320px)]"
                >
                  <FallbackMark tool={TOOL_MARKS[0]!} />
                </div>
                <h2
                  data-tool-name
                  className="metal-text font-editorial text-[clamp(3rem,10vw,9rem)] leading-none"
                  style={{ "--tint": tintCss(TOOL_MARKS[0]!.tint) } as React.CSSProperties}
                >
                  {TOOL_MARKS[0]!.name}
                </h2>
              </div>

              {/* The wheel: the other eleven orbit through the viewport on two
                  counter-weighted circles — names off the left edge, marks off
                  the right — scrubbed by four viewports of scroll while the
                  stage holds still. */}
              <div data-wheel-pin className="wheel-pin">
                <div data-wheel-stage className="wheel-stage">
                  <div data-wheel-circle-left aria-hidden className="wheel-circle wheel-circle-left">
                    {TOOL_MARKS.slice(1).map((tool) => (
                      <div key={tool.name} className="wheel-item">
                        <p
                          className="wheel-label metal-text font-editorial"
                          style={{ "--tint": tintCss(tool.tint) } as React.CSSProperties}
                        >
                          {tool.name}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div data-wheel-circle-right className="wheel-circle wheel-circle-right">
                    {TOOL_MARKS.slice(1).map((tool, idx) => (
                      <div key={tool.name} className="wheel-item">
                        <div data-metal-anchor={idx + 1} className="wheel-media">
                          <FallbackMark tool={tool} />
                          <span className="sr-only">{tool.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Finale: thirteen tools, one card. */}
              <div
                data-finale
                className="relative flex min-h-svh flex-col items-center justify-center gap-12 overflow-hidden px-6 py-24 text-center"
              >
                {/* The page's dust, landing: particles drift in from the
                    section's edges and are absorbed into the card. */}
                <FinaleInfall />
                <h2 className="relative max-w-[16ch] font-editorial text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.98] text-foreground">
                  All of it lands on your profile.
                </h2>
                <div data-act-card className="relative">
                  {/* The light the dust lands in — and the whole backdrop when
                      the canvas doesn't run (reduced motion, JS off). */}
                  <div aria-hidden className="infall-bloom" />
                  <DiscordCard className="relative" />
                </div>
                <p className="relative max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
                  The card appears the moment a tracked tool goes active, your rank rides on it
                  while you work, and it clears when the tool stops. Nothing to configure.
                </p>
              </div>
            </div>
          </section>

          {/* ── Privacy: the curtain ─────────────────────────────────────── */}
          <section
            id="privacy"
            className="relative z-20 border-t border-border bg-background px-6 py-32 sm:px-10"
          >
            <div className="mx-auto max-w-[1400px]">
              <p className="font-caps text-[11px] uppercase tracking-[0.34em] text-primary">
                02 / How it knows
              </p>

              <h2
                data-statement
                className="mt-8 font-editorial text-[clamp(2.8rem,8.5vw,8.5rem)] leading-[0.94] tracking-[-0.01em] text-foreground"
              >
                It reads the clock.
                <br />
                Not the file.
              </h2>

              <p
                data-reveal
                className="mt-12 max-w-[62ch] translate-y-6 text-[17px] leading-relaxed text-muted-foreground opacity-0"
              >
                Every AI coding tool writes session files to disk. grindeasy decides a tool is
                active from one signal only:{" "}
                <span className="text-foreground">when those files last changed</span>. It never
                opens them. It doesn’t need to.
              </p>

              <div data-ledger className="mt-20 grid gap-16 md:grid-cols-2 md:gap-0">
                <div
                  data-reveal
                  className="translate-y-6 opacity-0 md:border-r md:border-border md:pr-14"
                >
                  <p className="font-caps text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                    Only if you join the board
                  </p>
                  <h3 className="mt-3 font-editorial text-[clamp(1.8rem,3vw,2.6rem)] leading-tight text-foreground">
                    What leaves your machine
                  </h3>
                  <ul className="mt-8">
                    {LEAVES.map((item, i) => (
                      <li
                        key={item}
                        className="flex items-baseline gap-5 border-t border-border py-4"
                      >
                        <span className="font-mono text-[11px] text-primary">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="text-[17px] text-foreground">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div data-reveal className="translate-y-6 opacity-0 md:pl-14">
                  <p className="font-caps text-[10px] uppercase tracking-[0.3em] text-primary">
                    Ever. No opt-in exists
                  </p>
                  <h3 className="mt-3 font-editorial text-[clamp(1.8rem,3vw,2.6rem)] leading-tight text-foreground">
                    What{" "}
                    <span className="relative inline-block px-[0.06em]">
                      never
                      <svg
                        aria-hidden
                        viewBox="0 0 120 58"
                        fill="none"
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute -left-[18%] -top-[32%] h-[164%] w-[136%]"
                      >
                        {/* A full ellipse around the word — starts left-of-centre,
                            sweeps the top, and overlaps its own tail so it reads
                            hand-drawn without ever crossing the letters. */}
                        <path
                          data-draw
                          pathLength={1}
                          d="M14 30 C 14 13, 40 6, 62 6 C 90 6, 110 13, 110 29 C 110 44, 86 52, 58 52 C 32 52, 12 45, 12 31 C 12 22, 24 13, 44 9"
                          stroke="var(--primary)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
                        />
                      </svg>
                    </span>{" "}
                    leaves
                  </h3>
                  <ul className="mt-8">
                    {NEVER_LEAVES.map((item) => (
                      <li
                        key={item}
                        className="flex items-baseline gap-5 border-t border-border py-4"
                      >
                        <span aria-hidden className="font-mono text-[11px] text-muted-foreground">
                          ×
                        </span>
                        {/* One step brighter than muted: these rows have to
                            stay readable through the strike. */}
                        <span className="relative inline-block text-[17px] text-foreground/80">
                          {item}
                          <span
                            data-strike
                            aria-hidden
                            className="absolute left-0 top-1/2 h-px w-full origin-left scale-x-0 bg-primary/70"
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <p
                data-reveal
                className="mt-14 max-w-[68ch] translate-y-6 text-[15px] text-muted-foreground opacity-0"
              >
                By default the agent talks to your Discord app and a dashboard on localhost, and
                nothing else. The leaderboard is opt-in. The whole thing is open source, so check
                every line.
              </p>
            </div>
          </section>

          {/* ── Board CTA ──────────────────────────────────────────────────── */}
          <section className="relative z-20 border-t border-border px-6 py-32 sm:px-10">
            <div className="mx-auto max-w-[1400px]">
              <p className="font-caps text-[11px] uppercase tracking-[0.34em] text-primary">
                03 / The board
              </p>

              <h2
                data-reveal
                className="mt-8 max-w-[18ch] translate-y-6 font-editorial text-[clamp(2.5rem,7vw,7rem)] leading-[0.94] tracking-[-0.01em] text-foreground opacity-0"
              >
                One board.{" "}
                <span className="relative inline-block">
                  Hours,
                  <svg
                    aria-hidden
                    viewBox="0 0 200 14"
                    fill="none"
                    preserveAspectRatio="none"
                    className="absolute -bottom-[0.06em] left-0 h-[0.14em] w-full"
                  >
                    <path
                      data-draw
                      pathLength={1}
                      d="M4 10 C 40 2, 80 12, 118 6 S 180 4, 196 8"
                      stroke="var(--primary)"
                      strokeWidth="3"
                      strokeLinecap="round"
                      style={{ strokeDasharray: 1, strokeDashoffset: 1 }}
                    />
                  </svg>
                </span>{" "}
                not spend.
              </h2>

              <p
                data-reveal
                className="mt-8 max-w-[58ch] translate-y-6 text-[17px] leading-relaxed text-muted-foreground opacity-0"
              >
                Scored on active hours plus combos for running two tools in the same five-minute
                window. Your plan shows as context and never weights your score. The agent
                self-reports; the server clamps.
              </p>

              <div data-reveal className="mt-12 translate-y-6 opacity-0">
                <Magnetic strength={0.2}>
                  <Link
                    href="/leaderboard"
                    data-roll
                    className="inline-flex items-center gap-3 rounded-full bg-primary px-6 py-4 font-caps text-[11px] uppercase tracking-[0.18em] text-primary-foreground sm:gap-4 sm:px-9 sm:py-5 sm:text-[13px] sm:tracking-[0.22em]"
                  >
                    <span data-mag="0.35" className="inline-flex">
                      <RollText text="Enter the leaderboard" />
                    </span>
                    <span data-mag="0.5" aria-hidden>
                      →
                    </span>
                  </Link>
                </Magnetic>
              </div>
            </div>
          </section>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <footer className="relative z-20 overflow-hidden border-t border-border px-6 pb-8 pt-24 sm:px-10">
            <div className="mx-auto max-w-[1400px]">
              <div className="flex flex-wrap items-center justify-between gap-4 font-caps text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                <span>free forever · MIT</span>
                <div className="flex items-center gap-8">
                  <Link href="/leaderboard" className="link-underline hover:text-foreground">
                    The board
                  </Link>
                  <a
                    href="https://github.com/shashank03-dev/grindeasy"
                    className="link-underline hover:text-foreground"
                    target="_blank"
                    rel="noreferrer"
                  >
                    GitHub ↗
                  </a>
                </div>
              </div>

              <Link
                href="/"
                data-roll
                data-footer-brand
                className="mt-20 flex items-center justify-center gap-[0.5vw]"
              >
                <Mark className="h-[clamp(2rem,8.5vw,7.5rem)] w-[clamp(2rem,8.5vw,7.5rem)] shrink-0" />
                {/* No tight leading here: .roll-line clips to its line box, so
                    squeezing it decapitates the display face's ascenders. */}
                <RollText
                  text="grindeasy"
                  className="font-editorial text-[clamp(3rem,14vw,12.5rem)] tracking-[-0.01em] text-foreground"
                />
              </Link>

              <p className="mt-8 text-center font-caps text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                It never reads your code
              </p>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
