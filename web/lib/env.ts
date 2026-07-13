export interface Env {
  /** Public base URL, no trailing slash. */
  baseUrl: string;
  discordClientId: string;
  discordClientSecret: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  // A variable that exists but is BLANK must count as absent. `??` alone lets
  // "" through, and an empty base URL is worse than a missing one: it silently
  // degrades the OAuth redirect_uri to a bare "/auth/callback", which Discord
  // rejects — so sign-in breaks everywhere while every other page looks fine.
  // Vercel's dashboard happily stores an empty value, so this is reachable in
  // production, not a hypothetical.
  const configured = source.BASE_URL?.trim();

  // VERCEL_PROJECT_PRODUCTION_URL is the project's shortest production custom
  // domain (protocol not included), and Vercel sets it on every deployment
  // including previews. It is the right answer whenever BASE_URL is not.
  const baseUrl = (
    configured ||
    (source.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${source.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/+$/, "");

  return {
    baseUrl,
    discordClientId: source.DISCORD_CLIENT_ID ?? "",
    discordClientSecret: source.DISCORD_CLIENT_SECRET ?? "",
  };
}

/** Login is optional: without credentials the board and ingest still work. */
export function oauthConfigured(env: Env): boolean {
  return Boolean(env.discordClientId && env.discordClientSecret);
}
