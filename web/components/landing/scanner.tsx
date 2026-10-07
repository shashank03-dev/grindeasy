"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { pad, scramble } from "@/components/site/motion";
import { TOOL_MARKS, type ToolMark } from "./tool-data";

gsap.registerPlugin(ScrollTrigger);

// Chapter 03. The thirteen tools pass under a focus line as you scroll, like a
// scanner stepping through folders; whichever sits on the line is "detected"
// and the readout on the right reports what the agent actually checks for it
// — one folder, one timestamp. Under reduced motion the pin is dropped and
// the same list simply lays out as an index.

function ToolGlyph({ tool, className }: { tool: ToolMark; className?: string }) {
  return tool.path ? (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <path d={tool.path} fill="currentColor" />
    </svg>
  ) : (
    <span aria-hidden className={`grid place-items-center font-pixel text-[0.42em] leading-none ${className ?? ""}`}>
      {tool.code}
    </span>
  );
}

export function Scanner() {
  const first = TOOL_MARKS[0]!;
  return (
    <section
      id="scan"
      data-chapter="03 Scan"
      data-scene="scan"
      className="group/scan relative z-10 h-svh overflow-hidden px-4 md:px-10 data-[static]:h-auto data-[static]:py-28"
    >
      <div className="pointer-events-none absolute inset-x-4 top-24 z-20 flex items-start justify-between md:inset-x-10 md:top-28 group-data-[static]/scan:static">
        <p className="label text-muted-foreground">[03] The thirteen it watches</p>
        <p className="font-pixel text-[clamp(1.4rem,2.6vw,2.4rem)] leading-none tabular-nums text-paper group-data-[static]/scan:hidden">
          <span data-scan-index>01</span>
          <span className="text-muted-foreground">/{TOOL_MARKS.length}</span>
        </p>
      </div>

      <div className="grid h-full content-center gap-6 pt-24 md:grid-cols-12 md:content-stretch md:pt-0 group-data-[static]/scan:h-auto group-data-[static]/scan:pt-0">
        {/* The reel. Positioned so item 0 starts centred on the focus line. */}
        <div className="relative h-[46svh] overflow-hidden [mask-image:linear-gradient(transparent,#000_22%,#000_78%,transparent)] md:col-span-7 md:h-auto group-data-[static]/scan:[mask-image:none] group-data-[static]/scan:h-auto group-data-[static]/scan:overflow-visible">
          <span
            aria-hidden
            className="absolute inset-x-0 top-1/2 z-10 h-px bg-signal/70 group-data-[static]/scan:hidden"
          />
          <span
            aria-hidden
            className="label absolute right-0 top-1/2 z-10 -translate-y-[calc(100%+6px)] text-signal group-data-[static]/scan:hidden"
          >
            detected
          </span>
          <ol
            data-scan-list
            className="absolute inset-x-0 top-1/2 group-data-[static]/scan:static group-data-[static]/scan:mt-10"
          >
            {TOOL_MARKS.map((tool, i) => (
              <li
                key={tool.name}
                data-scan-item
                className="display flex h-[1.06em] -translate-y-1/2 items-center gap-[0.3em] whitespace-nowrap text-[clamp(2.4rem,6.6vw,7rem)] text-paper group-data-[static]/scan:h-auto group-data-[static]/scan:translate-y-0 group-data-[static]/scan:py-2"
              >
                <span className="font-mono text-[max(0.16em,11px)] tracking-normal text-paper/70">
                  {pad(i + 1)}
                </span>
                {tool.name}
                <span className="hidden font-mono text-[max(0.17em,12px)] tracking-normal text-muted-foreground group-data-[static]/scan:inline">
                  {tool.watch}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* The readout. */}
        <div className="relative flex flex-col justify-center md:col-span-4 md:col-start-9 group-data-[static]/scan:!hidden">
          <div className="border border-line bg-ink/90 p-5 backdrop-blur-md md:p-6">
            <div className="relative hidden aspect-square w-28 text-paper md:block">
              {TOOL_MARKS.map((tool, i) => (
                <div
                  key={tool.name}
                  data-scan-mark
                  className="absolute inset-0 text-[7rem] transition-[opacity,filter] duration-500"
                  style={{ opacity: i === 0 ? 1 : 0 }}
                >
                  <ToolGlyph tool={tool} className="h-full w-full" />
                </div>
              ))}
            </div>
            <dl className="label grid md:mt-8 grid-cols-[7.5rem_1fr] gap-x-3 gap-y-3 normal-case tracking-[0.04em]">
              <dt className="uppercase tracking-[0.14em] text-muted-foreground">Tool</dt>
              <dd data-scan-name className="text-paper">{first.name}</dd>
              <dt className="uppercase tracking-[0.14em] text-muted-foreground">Watches</dt>
              <dd data-scan-watch className="break-all text-paper">{first.watch}</dd>
              <dt className="uppercase tracking-[0.14em] text-muted-foreground">Reads</dt>
              <dd className="text-paper">st_mtime only</dd>
              <dt className="uppercase tracking-[0.14em] text-muted-foreground">Last write</dt>
              <dd className="tabular-nums text-paper">
                <span data-scan-age>0.0</span>s ago
              </dd>
              <dt className="uppercase tracking-[0.14em] text-muted-foreground">Status</dt>
              <dd className="flex items-center gap-2 text-signal">
                <span className="pulse" /> active
              </dd>
            </dl>
          </div>
        </div>
      </div>
    </section>
  );
}

export function buildScanner(reduced: boolean) {
  const section = document.querySelector<HTMLElement>("#scan")!;

  if (reduced) {
    section.dataset.static = "";
    return () => {
      delete section.dataset.static;
    };
  }

  const list = section.querySelector<HTMLElement>("[data-scan-list]")!;
  const items = gsap.utils.toArray<HTMLElement>("[data-scan-item]", section);
  const marks = gsap.utils.toArray<HTMLElement>("[data-scan-mark]", section);
  const indexEl = section.querySelector<HTMLElement>("[data-scan-index]")!;
  const nameEl = section.querySelector<HTMLElement>("[data-scan-name]")!;
  const watchEl = section.querySelector<HTMLElement>("[data-scan-watch]")!;
  const ageEl = section.querySelector<HTMLElement>("[data-scan-age]")!;
  const last = items.length - 1;

  let active = 0;
  let wroteAt = performance.now();
  const setActive = (i: number) => {
    if (i === active) return;
    active = i;
    wroteAt = performance.now();
    const tool = TOOL_MARKS[i]!;
    indexEl.textContent = pad(i + 1);
    scramble(nameEl, tool.name, { duration: 0.45 });
    scramble(watchEl, tool.watch, { duration: 0.55 });
    marks.forEach((m, j) => {
      m.style.opacity = j === i ? "1" : "0";
      m.style.filter = j === i ? "none" : "blur(6px)";
    });
  };

  const render = (p: number) => {
    const h = items[0]!.offsetHeight;
    gsap.set(list, { y: -p * h });
    items.forEach((el, i) => {
      const d = Math.abs(i - p);
      el.style.opacity = String(Math.max(0.3, 1 - d * 0.32));
    });
    setActive(Math.round(p));
  };
  render(0);

  const state = { p: 0 };
  gsap.to(state, {
    p: last,
    ease: "none",
    onUpdate: () => render(state.p),
    scrollTrigger: {
      trigger: section,
      start: "top top",
      end: () => `+=${last * window.innerHeight * 0.32}`,
      pin: true,
      scrub: 0.5,
      // No inertia: a hard fling must settle on a nearby tool, not coast to
      // the end of the reel.
      snap: { snapTo: 1 / last, inertia: false, duration: 0.35, delay: 0.05, ease: "power2.out" },
    },
  });

  // The age readout: counts up from the last "write", and the tool on the
  // line writes again every few seconds — the way a busy session looks.
  let raf = 0;
  const tick = (now: number) => {
    let age = (now - wroteAt) / 1000;
    if (age > 2.2 + (active % 3)) {
      wroteAt = now;
      age = 0;
    }
    ageEl.textContent = age.toFixed(1);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(raf);
}
