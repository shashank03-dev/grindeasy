export interface Env {
  /** Public base URL, no trailing slash. */
  baseUrl: string;
  discordClientId: string;
  discordClientSecret: string;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const baseUrl = (
    source.BASE_URL ??
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
