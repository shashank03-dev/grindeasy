import Link from "next/link";
import { LiveClock } from "./live-clock";
import { Mark } from "./mark";

const NAV = [
  { href: "/leaderboard", label: "Board" },
  { href: "/privacy", label: "Privacy" },
] as const;

/**
 * Fixed top chrome, shared by every page. The wordmark and links print in
 * difference blend so they stay legible over the dither field, over paper
 * and over ink without a backing bar. `slot` sits outside the blend group —
 * the account menu opens a panel that must keep its real colors.
 */
export function SiteHeader({ slot }: { slot?: React.ReactNode }) {
  return (
    <header className="fixed inset-x-0 top-0 z-50 flex items-start justify-between gap-6 px-4 pt-4 md:px-10 md:pt-6">
      <div className="flex items-center gap-8 mix-blend-difference">
        <Link href="/" className="group flex items-center gap-2.5 text-white" aria-label="grindeasy home">
          <Mark className="h-5 w-5 transition-transform duration-500 ease-[var(--ease-out-expo)] group-hover:-translate-y-0.5" />
          <span className="font-pixel text-[15px] leading-none tracking-[0.02em]">grindeasy</span>
        </Link>
        <span className="label hidden items-center gap-2 text-white/60 lg:inline-flex">
          <LiveClock className="tabular-nums text-white" /> local
        </span>
      </div>
      <div className="flex items-center gap-5 md:gap-8">
        {/* With a slot (the account control) there is no room for the text
            links on a phone; the footer carries them instead. */}
        <nav
          className={`items-center gap-5 mix-blend-difference md:gap-8 ${slot ? "hidden sm:flex" : "flex"}`}
          aria-label="Primary"
        >
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="label link-u text-white">
              {item.label}
            </Link>
          ))}
          <a
            href="https://github.com/shashank03-dev/grindeasy"
            target="_blank"
            rel="noreferrer"
            className="label link-u hidden text-white sm:inline"
          >
            GitHub ↗
          </a>
        </nav>
        {slot}
      </div>
    </header>
  );
}
