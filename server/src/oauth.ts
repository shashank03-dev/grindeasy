/**
 * Discord OAuth2 authorization-code flow, scope "identify" only — we learn the
 * user's id, username and avatar, nothing else. No guilds, no email.
 */

const DISCORD_API = "https://discord.com/api/v10";

export interface DiscordUser {
  id: string;
  username: string;
  global_name?: string | null;
  avatar: string | null;
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const u = new URL("https://discord.com/oauth2/authorize");
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "identify");
  u.searchParams.set("state", state);
  return u.toString();
}

export async function exchangeCode(
  opts: { clientId: string; clientSecret: string; redirectUri: string; code: string },
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: "authorization_code",
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }).toString(),
  });
  if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}`);
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("token exchange returned no access_token");
  return data.access_token;
}

export async function fetchDiscordUser(
  accessToken: string,
  fetchFn: typeof fetch = fetch,
): Promise<DiscordUser> {
  const res = await fetchFn(`${DISCORD_API}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`users/@me failed: HTTP ${res.status}`);
  return (await res.json()) as DiscordUser;
}

/** Preferred display name: global display name, falling back to the username. */
export function displayName(user: DiscordUser): string {
  return (user.global_name ?? "").trim() || user.username;
}
