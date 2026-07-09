import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { createSession, upsertUser } from "@/lib/db/queries";
import { displayName, exchangeCode, fetchDiscordUser } from "@/lib/discord";
import { loadEnv, oauthConfigured } from "@/lib/env";
import { RETURN_COOKIE, SESSION_COOKIE, SESSION_MAX_AGE_S, STATE_COOKIE } from "@/lib/session";

export async function GET(request: Request) {
  const env = loadEnv();
  if (!oauthConfigured(env)) {
    return new Response("Discord OAuth is not configured on this server.", { status: 503 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";

  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  const returnTo = jar.get(RETURN_COOKIE)?.value ?? "/";
  const secure = env.baseUrl.startsWith("https://");

  if (!code || !state || !expected || state !== expected) {
    return new Response("OAuth state mismatch — try again.", { status: 400 });
  }

  const accessToken = await exchangeCode({
    clientId: env.discordClientId,
    clientSecret: env.discordClientSecret,
    redirectUri: `${env.baseUrl}/auth/callback`,
    code,
  });
  const discordUser = await fetchDiscordUser(accessToken);
  const user = await upsertUser(getDb(), discordUser.id, displayName(discordUser), discordUser.avatar);
  const session = await createSession(getDb(), user.id);

  jar.set(SESSION_COOKIE, session, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_S,
    path: "/",
  });
  jar.delete(STATE_COOKIE);
  jar.delete(RETURN_COOKIE);

  return Response.redirect(new URL(returnTo, env.baseUrl));
}
