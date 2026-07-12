"use client";

import dynamic from "next/dynamic";

// WebGL is browser-only; keep it out of the server render. `ssr: false` is legal
// here because this file is itself a Client Component.
const Particles = dynamic(() => import("./particles/particles"), { ssr: false });

// Tier palettes echo the metallic ramp used by the tier badges, as hex (OGL
// samples across each set). These are atmospheric, not exact color matches.
const TIER_PALETTES: Record<string, string[]> = {
  Bronze: ["#cd7f4d", "#e0a566", "#8c5a2b"],
  Silver: ["#c8cdd6", "#9aa3b0", "#eaedf2"],
  Gold: ["#e8c14a", "#f4d878", "#b8912e"],
  Platinum: ["#bfe0e6", "#dceff3", "#9cc6cf"],
  Diamond: ["#7fe3ea", "#a9f0f4", "#4fc8d6"],
};

/**
 * Whole-page background. Pure black when signed out; on sign-in the tier-colored
 * particles take birth and react to the cursor. Sits behind all content and
 * never intercepts pointer events.
 */
export function ParticleField({
  signedIn,
  tier,
  online,
}: {
  signedIn: boolean;
  tier: string | null;
  online: boolean;
}) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-black">
      {signedIn ? (
        <Particles
          className="absolute inset-0 h-full w-full"
          colors={TIER_PALETTES[tier ?? "Bronze"] ?? TIER_PALETTES.Bronze}
          revealed
          online={online}
        />
      ) : null}
    </div>
  );
}
