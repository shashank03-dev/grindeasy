export interface Env {
  port: number;
  /** Public base URL, no trailing slash, e.g. https://grindboard.fly.dev */
  baseUrl: string;
  discordClientId: string;
  discordClientSecret: string;
  dbPath: string;
}

export function loadEnv(env: NodeJS.ProcessEnv = process.env): Env {
  const port = Number(env.PORT ?? 8787);
  const baseUrl = (env.BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
  return {
    port,
    baseUrl,
    discordClientId: env.DISCORD_CLIENT_ID ?? "",
    discordClientSecret: env.DISCORD_CLIENT_SECRET ?? "",
    dbPath: env.DB_PATH ?? "./grindboard.db",
  };
}

/** OAuth (login) is optional: without it the board + ingest still work. */
export function oauthConfigured(env: Env): boolean {
  return Boolean(env.discordClientId && env.discordClientSecret);
}
