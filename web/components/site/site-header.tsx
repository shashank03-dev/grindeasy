import Link from "next/link";
import { LiveClock } from "./live-clock";
import { Mark } from "./mark";

const NAV = [
  { href: "/leaderboard", label: "Board" },
  { href: "/privacy", label: "Privacy" },
] as const;

// The backing every header group sits on: a small slab of ink, frosted, with
// a hairline edge. Difference blend was tried first and turned to noise over
// the dither field — a dithered surface has no single color to invert against.
const PLATE = "border border-line bg-ink/95 backdrop-blur-md";

/**
 * Fixed top chrome, shared by every page: two frosted ink plates, wordmark
 * and clock on the left, links and the optional `slot` (the account menu) on
 * the right. Legible over the field, over paper and over ink alike.
 */
export function SiteHeader({ slot }: { slot?: React.ReactNode }) {
  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex items-start justify-between gap-3 px-4 pt-4 md:px-10 md:pt-6">
      <div className={`pointer-events-auto flex h-10 items-center gap-6 px-3.5 ${PLATE}`}>
        <Link href="/" className="group flex items-center gap-2.5 text-paper" aria-label="grindeasy home">
          <Mark className="h-5 w-5 transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5" />
          <span className="font-pixel text-[15px] leading-none tracking-[0.02em]">grindeasy</span>
        </Link>
        <span className="label hidden items-center gap-2 border-l border-line pl-6 text-muted-foreground lg:inline-flex">
          <LiveClock className="tabular-nums text-paper" /> local
        </span>
      </div>
      <div className="pointer-events-auto flex items-center gap-3">
        {/* With a slot (the account control) there is no room for the text
            links on a phone; the footer carries them instead. */}
        <nav
          className={`h-10 items-center gap-5 px-4 md:gap-7 ${PLATE} ${slot ? "hidden sm:flex" : "flex"}`}
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="label link-u text-paper">
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/shashank03-dev/grindeasy"
            target="_blank"
            rel="noreferrer"
            className="label link-u hidden text-paper sm:inline"
          >
            GitHub ↗
          </a>
        </nav>
        {slot}
      </div>
    </header>
  );
}
