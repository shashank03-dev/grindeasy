import Link from "next/link";
import { LiveClock } from "./live-clock";

/**
 * The sign-off: the wordmark set in pixel type at the full width of the page,
 * standing on the bottom edge. `data-footer-word` lets the landing animate the
 * letters in; elsewhere it simply sits there.
 */
export function SiteFooter() {
  return (
    <footer className="relative z-10 overflow-hidden border-t border-line bg-ink px-4 pt-16 md:px-10">
      <div className="grid gap-10 md:grid-cols-12">
        <p className="max-w-[28ch] text-[15px] leading-snug text-muted-foreground md:col-span-4">
          A tiny local agent for your AI coding hours.{" "}
          <span className="text-paper">It never reads your code.</span>
        </p>
        <ul className="label flex flex-col gap-3 md:col-span-2 md:col-start-7">
          <li className="text-muted-foreground/60">Site</li>
          <li><Link href="/" className="link-u text-paper">Home</Link></li>
          <li><Link href="/leaderboard" className="link-u text-paper">Leaderboard</Link></li>
          <li><Link href="/privacy" className="link-u text-paper">Privacy</Link></li>
        </ul>
        <ul className="label flex flex-col gap-3 md:col-span-2">
          <li className="text-muted-foreground/60">Source</li>
          <li>
            <a href="https://github.com/shashank03-dev/grindeasy" target="_blank" rel="noreferrer" className="link-u text-paper">
              GitHub ↗
            </a>
          </li>
          <li>
            <a href="https://www.npmjs.com/package/grindeasy" target="_blank" rel="noreferrer" className="link-u text-paper">
              npm ↗
            </a>
          </li>
        </ul>
        <div className="label flex flex-col gap-3 md:col-span-2 md:items-end">
          <span className="text-muted-foreground/60">Local time</span>
          <LiveClock className="font-dot text-[22px] tracking-normal text-signal tabular-nums" />
        </div>
      </div>

      <p
        data-footer-word
        className="mt-16 flex select-none justify-between overflow-hidden font-pixel text-[clamp(4rem,19.5vw,22rem)] leading-[0.92] tracking-[-0.02em] text-paper"
      >
        <span className="sr-only">grindeasy</span>
        {"grindeasy".split("").map((c, i) => (
          <span key={i} aria-hidden className="inline-block">
            {c}
          </span>
        ))}
      </p>

      <div className="label flex flex-wrap items-center justify-between gap-3 border-t border-line py-5 text-muted-foreground">
        <span>Free forever · MIT</span>
        <span>Made for the hours you put in</span>
      </div>
    </footer>
  );
}
