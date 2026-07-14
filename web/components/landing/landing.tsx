"use client";

import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollSmoother } from "gsap/ScrollSmoother";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { cn } from "@/lib/utils";
import { DiscordCard } from "./discord-card";
import { Magnetic, RollText } from "./interactive";
import { Mark } from "./mark";
import { LandingStage, stageState } from "./stage";
import { TOOL_MARKS } from "./tool-data";

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
        <div className="grid h-full w-full place-items-center rounded-[9%] border border-border">
          <span
            className="metal-text font-caps text-[clamp(1.3rem,4.2vmin,2.6rem)] tracking-[0.12em]"
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

        // Reduced motion: everything is simply present. No loader hold, no
        // scroll hijack, no particles (the stage never builds), drawn
        // decorations already drawn, struck rows already struck.
        mm.add("(prefers-reduced-motion: reduce)", () => {
          gsap.set("[data-loader]", { display: "none" });
          gsap.set("[data-reveal]", { opacity: 1, y: 0 });
          gsap.set("[data-hero-line]", { opacity: 1 });
          gsap.set("[data-draw]", { strokeDashoffset: 0 });
          gsap.set("[data-strike]", { scaleX: 1 });
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
          gsap.set(heads, { opacity: 1 });

          const intro = gsap.timeline({ paused: true, defaults: { ease: "expo.out" } });
          intro
            .from(
              splits.flatMap((s) => s.lines),
              { yPercent: 115, duration: 1.25, stagger: 0.09 },
            )
            .from("[data-hero-eyebrow]", { opacity: 0, duration: 0.6 }, 0.15)
            .from("[data-hero-sub]", { opacity: 0, y: 24, duration: 0.9 }, 0.5)
            .from(
              "[data-hero-actions] > *",
              { opacity: 0, y: 20, duration: 0.8, stagger: 0.08 },
              0.65,
            )
            .from("[data-hero-cue]", { opacity: 0, duration: 0.6 }, 1);

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
                  intro.play();
                },
              })
              .from("[data-loader-brand]", {
                filter: "blur(10px)",
                y: 8,
                opacity: 0,
                duration: 1.2,
                ease: "expo.out",
              })
              .to(
                "[data-loader-brand]",
                { filter: "blur(10px)", opacity: 0, duration: 0.5, ease: "expo.in" },
                "+=0.6",
              )
              .to("[data-loader]", { autoAlpha: 0, duration: 0.4 }, "<0.2")
              .set("[data-loader]", { display: "none" });
          }

          // The morph: hero pinned while the photograph's particles stream out
          // and re-form as the first tool's mark, hold it, then lift away —
          // the seam into the tools section. stageState is read by the WebGL
          // loop every frame; on the no-WebGL path the same scrub fades the
          // static image instead and the section header simply arrives.
          gsap
            .timeline({
              defaults: { ease: "none" },
              scrollTrigger: {
                trigger: "#hero",
                start: "top top",
                end: "+=170%",
                pin: true,
                scrub: 1,
              },
            })
            .to("[data-hero-content]", { opacity: 0, yPercent: -14, duration: 0.28 }, 0)
            .to("[data-hero-scrim]", { opacity: 0, duration: 0.32 }, 0)
            .to("[data-hero-img]", { opacity: 0, duration: 0.4 }, 0.05)
            .to(stageState, { morph: 1, duration: 0.75 }, 0.08);

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

          // Tool names: the specular slides across the metal exactly as fast
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

          // Finale: the Discord card assembles and its timer runs up as it
          // crosses the viewport — the twelve tools funnel into this one card.
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

          return () => {
            splits.forEach((s) => s.revert());
            statement.revert();
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
            <stop offset="0" stopColor="#e8edf2" />
            <stop offset="0.48" stopColor="#878f99" />
            <stop offset="0.66" stopColor="#f4f7fa" />
            <stop offset="1" stopColor="#565c64" />
          </linearGradient>
        </defs>
      </svg>

      {/* Fixed chrome lives outside the smoothed content: ScrollSmoother
          transforms #smooth-content, and position:fixed inside a transformed
          ancestor silently becomes "scrolls away with the page". */}
      <LandingStage />
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
          <section
            id="hero"
            className="relative z-10 flex min-h-svh flex-col justify-end overflow-hidden px-6 pb-10 pt-28 sm:px-10"
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
                className="h-full w-full object-cover"
              />
            </div>
            <div data-hero-scrim aria-hidden className="scrim-b absolute inset-x-0 bottom-0 h-[62%]" />

            <div data-hero-content className="relative mx-auto w-full max-w-[1400px]">
              <p
                data-hero-eyebrow
                className="font-caps text-[11px] uppercase tracking-[0.34em] text-muted-foreground"
              >
                Local agent · v0.5.0 · MIT
              </p>

              <h1 className="mt-5 font-editorial text-[clamp(3rem,9vw,9rem)] leading-[0.94] tracking-[-0.01em] text-foreground">
                {HERO_LINES.map((line) => (
                  <span key={line} data-hero-line className="block opacity-0">
                    {line}
                  </span>
                ))}
              </h1>

              <div className="mt-9 flex flex-wrap items-end justify-between gap-x-16 gap-y-8">
                <p
                  data-hero-sub
                  className="max-w-[46ch] text-[16px] leading-relaxed text-muted-foreground"
                >
                  A tiny local agent that puts the AI tool you’re actually using on your Discord
                  profile, live while you work.{" "}
                  <span className="text-foreground">It never reads your code.</span>
                </p>

                <div data-hero-actions className="flex flex-wrap items-center gap-5">
                  <Magnetic>
                    <button
                      type="button"
                      data-roll
                      onClick={copyInstall}
                      className="flex items-center gap-3 rounded-full border border-input bg-background/50 px-6 py-4 font-mono text-[14px] text-foreground backdrop-blur-sm transition-colors hover:border-primary"
                    >
                      <span className="text-primary">$</span>
                      <span data-mag="0.4" className="inline-flex">
                        <RollText text="npx grindeasy" />
                      </span>
                      <span className="ml-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                        {copied ? "copied" : "copy"}
                      </span>
                    </button>
                  </Magnetic>

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

              <p
                data-hero-cue
                className="mt-12 text-center font-caps text-[10px] uppercase tracking-[0.4em] text-muted-foreground"
              >
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
                  01 / The twelve it watches
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

              {TOOL_MARKS.slice(1).map((tool, idx) => {
                const i = idx + 1;
                const odd = i % 2 === 1;
                return (
                  <div
                    key={tool.name}
                    className={cn(
                      "mx-auto flex max-w-[1500px] items-center gap-[6vw] px-6 py-[8vh] sm:px-10",
                      odd && "flex-row-reverse",
                    )}
                  >
                    <div data-speed={odd ? "1.06" : "0.95"} className="min-w-0 flex-1">
                      <p className="font-caps text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </p>
                      <h3
                        data-tool-name
                        className={cn(
                          "metal-text mt-3 font-editorial text-[clamp(2.5rem,7.5vw,7.5rem)] leading-[0.95]",
                          odd && "text-right",
                        )}
                        style={{ "--tint": tintCss(tool.tint) } as React.CSSProperties}
                      >
                        {tool.name}
                      </h3>
                    </div>
                    <div
                      data-speed={odd ? "0.93" : "1.05"}
                      data-metal-anchor={i}
                      className="relative aspect-square w-[clamp(110px,18vmin,220px)] shrink-0"
                    >
                      <FallbackMark tool={tool} />
                    </div>
                  </div>
                );
              })}

              {/* Finale: twelve tools, one card. */}
              <div
                data-finale
                className="flex min-h-svh flex-col items-center justify-center gap-12 px-6 py-24 text-center"
              >
                <h2 className="max-w-[16ch] font-editorial text-[clamp(2.4rem,6vw,5.5rem)] leading-[0.98] text-foreground">
                  All of it lands on your profile.
                </h2>
                <div data-act-card>
                  <DiscordCard />
                </div>
                <p className="max-w-[44ch] text-[15px] leading-relaxed text-muted-foreground">
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
                        viewBox="0 0 120 56"
                        fill="none"
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute -left-[12%] -top-[22%] h-[150%] w-[124%]"
                      >
                        <path
                          data-draw
                          pathLength={1}
                          d="M10 32 C 12 12, 74 4, 104 14 C 120 20, 116 40, 84 48 C 48 56, 8 50, 8 34 C 8 28, 16 22, 28 19"
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
                className="mt-14 translate-y-6 text-[15px] text-muted-foreground opacity-0"
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
                  hours,
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
