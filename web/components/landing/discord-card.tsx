import { cn } from "@/lib/utils";
import { Mark } from "./mark";

// A faithful still of the thing the product actually ships: the Rich Presence
// card as Discord draws it. Every value here is the shape the agent really sends.
export function DiscordCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "w-full max-w-[380px] rounded-xl border border-white/10 bg-[#232428] p-4 shadow-[0_40px_80px_-40px_rgba(0,0,0,0.9)]",
        className,
      )}
    >
      <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.12em] text-white/50">
        Playing a game
      </p>

      <div className="flex gap-3.5">
        {/* self-start, or the flex row stretches this box past the avatar and the
            badge below anchors to the row's bottom edge instead. */}
        <div className="relative shrink-0 self-start">
          <div className="grid h-[60px] w-[60px] place-items-center rounded-lg bg-[#0a0d0c] ring-1 ring-white/10">
            <Mark className="h-9 w-9" />
          </div>
          {/* Kept inside the avatar's footprint — hanging off the corner puts it
              level with the timer line, where it reads as a bullet, not a badge. */}
          <span
            aria-hidden
            className="absolute bottom-0.5 right-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-primary text-[10px] font-bold text-black ring-2 ring-[#232428]"
          >
            P
          </span>
        </div>

        <div className="min-w-0 flex-1 pt-0.5">
          <p className="truncate text-[15px] font-bold text-white">grindeasy</p>
          <p className="truncate text-[13px] text-white/80">Coding · Claude Code + Codex</p>
          <p className="truncate font-mono text-[12px] text-white/55">
            #12 on grindeasy · ◆ Platinum · PRO
          </p>
          <p className="mt-0.5 font-mono text-[12px] tabular-nums text-white/55">
            <span data-card-timer>02:14:07</span> elapsed
          </p>
        </div>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2">
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
