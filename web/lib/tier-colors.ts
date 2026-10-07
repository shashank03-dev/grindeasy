/**
 * Tier colors are data colors, not brand accents: five values on a metallic
 * ramp, shared by the badge, the account card, the board's dither field and
 * the landing's tier ladder. They avoid the phosphor signal green, which is
 * reserved for interactive and "live" state.
 */
export const TIER_HEX: Record<string, string> = {
  Bronze: "#c98b5e",
  Silver: "#c9ccd4",
  Gold: "#ebc455",
  Platinum: "#bfe4ea",
  Diamond: "#86eefc",
};

export const tierHex = (name: string | null | undefined, fallback = "#ecebe4") =>
  (name && TIER_HEX[name]) || fallback;
