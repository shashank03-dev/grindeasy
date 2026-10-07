import { cn } from "@/lib/utils";
import { Mark } from "@/components/site/mark";

// A faithful still of what the product ships: the Rich Presence card the way
// Discord draws it. Every value is the shape the agent really sends. The data
// attributes are hooks for the presence chapter, which rewrites the activity
// and status lines as its story advances.
export function DiscordCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        // text-left: Discord never centers these rows, whatever the section does.
        "w-full max-w-[400px] rounded-xl bg-[#232428] p-4 text-left font-sans shadow-[0_50px_100px_-40px_rgba(0,0,0,0.95)] ring-1 ring-white/10",
        className,
      )}
    >
      <p data-card-row className="mb-3 text-[11px] font-bold uppercase tracking-[0.06em] text-white/55">
        Playing a game
      </p>

      <div className="flex gap-3.5">
        <div data-card-row className="relative shrink-0 self-start">
          <div className="grid h-[64px] w-[64px] place-items-center rounded-lg bg-[#0b0c0d] ring-1 ring-white/10">
            <Mark className="h-10 w-10" />
          </div>
          <span
            aria-hidden
            className="absolute bottom-0.5 right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-signal text-[10px] font-bold text-black ring-2 ring-[#232428]"
          >
            P
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p data-card-row className="truncate text-[15px] font-semibold text-white">
            grindeasy
          </p>
          <p data-card-row className="truncate text-[13px] text-white/80">
            Coding · <span data-card-activity>Claude Code</span>
          </p>
          <p data-card-row className="truncate font-mono text-[12px] text-white/55">
            <span data-card-rank>#12 on grindeasy · ◆ Platinum · PRO</span>
          </p>
          <p data-card-row className="mt-0.5 font-mono text-[12px] tabular-nums text-white/55">
            <span data-card-timer>02:14:07</span> elapsed
          </p>
        </div>
      </div>

      <div data-card-row className="mt-4 grid grid-cols-2 gap-2">
        <span className="rounded-md bg-white/10 py-1.5 text-center text-[13px] font-medium text-white">
          Join the board
        </span>
        <span className="rounded-md bg-white/10 py-1.5 text-center text-[13px] font-medium text-white">
          Get grindeasy
        </span>
      </div>
    </div>
  );
}
