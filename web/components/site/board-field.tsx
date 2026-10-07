"use client";

import { tierHex } from "@/lib/tier-colors";
import { DitherField, SHAPES, hexToRgb } from "./dither-field";

// The board's backdrop: the same dither field as the landing, held still on
// one pose. Signed out it is a quiet paper sphere; signed in, the object
// becomes your tier's diamond in your tier's color, and runs hotter while a
// tool of yours is live — the board answering to who is looking at it.
// Masked to the top of the viewport so the table always sits on clean ink.

export function BoardField({ tier, online }: { tier: string | null; online: boolean }) {
  const tint = hexToRgb(tierHex(tier));
  return (
    <DitherField
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-ink opacity-50 [mask-image:linear-gradient(#000_30%,transparent_72%)]"
      initial={{
        shape: tier ? SHAPES.diamond : SHAPES.core,
        x: 0.5,
        y: 0.2,
        scale: 0.62,
        tint,
        energy: online ? 0.9 : 0.25,
        reveal: 1,
        spin: 0,
      }}
    />
  );
}
