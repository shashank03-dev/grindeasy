import { cn } from "@/lib/utils";

// The grindeasy mark from assets/discord/src/mark.svg, minus the app-icon
// background tile: a primary ascent over the dim echo of the rank just left.
// Inline so it inherits layout color context and costs no request.
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      aria-hidden
      className={cn("h-[1.1em] w-[1.1em]", className)}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="26,54 50,32 74,54" stroke="#82d399" strokeWidth="22" strokeOpacity="0.12" />
      <polyline points="26,70 50,48 74,70" stroke="#4b8057" strokeWidth="11" />
      <polyline points="26,54 50,32 74,54" stroke="#82d399" strokeWidth="11" />
    </svg>
  );
}
