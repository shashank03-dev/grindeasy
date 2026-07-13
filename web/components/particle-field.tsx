"use client";

import dynamic from "next/dynamic";
import { useSyncExternalStore } from "react";
import { hasWebGL } from "@/lib/webgl";

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

// Probed once per page load, then memoized: whether the browser can hand out a
// WebGL context does not change while the page is open, and the probe touches
// the DOM, so it must not run per render.
let webglMemo: boolean | null = null;
const readWebGL = () => (webglMemo ??= hasWebGL());
// Nothing to subscribe to — the answer is fixed for the life of the document.
const subscribeNever = () => () => {};

/**
 * Whole-page background. Pure black when signed out; on sign-in the tier-colored
 * particles take birth and react to the cursor. Sits behind all content and
 * never intercepts pointer events.
 *
 * Not every browser can run the field: a GPU-less machine, a blocklisted driver,
 * or hardware acceleration switched off all leave WebGL unavailable. Those users
 * are signed in and have earned a tier, so they get a still tier-colored wash
 * rather than the black void a signed-out visitor sees. The probe is read through
 * useSyncExternalStore so the server snapshot (no WebGL) is what hydration
 * matches, and the real answer lands on the first client commit.
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
  const webglReady = useSyncExternalStore(subscribeNever, readWebGL, () => false);

  const palette = TIER_PALETTES[tier ?? "Bronze"] ?? TIER_PALETTES.Bronze;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 bg-black">
      {signedIn && webglReady ? (
        <Particles
          className="absolute inset-0 h-full w-full"
          colors={palette}
          revealed
          online={online}
        />
      ) : null}

      {signedIn && !webglReady ? (
        // Two offset radial washes in the tier's own colors: the same ambient
        // read as the field at rest, minus the motion. Fades in so the swap
        // doesn't flash on load.
        <div
          className="absolute inset-0 animate-in fade-in duration-1000"
          style={{
            backgroundImage: `radial-gradient(60% 50% at 25% 25%, ${palette[0]}22, transparent 70%), radial-gradient(55% 45% at 75% 70%, ${palette[2] ?? palette[0]}1a, transparent 70%)`,
          }}
        />
      ) : null}
    </div>
  );
}
