import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authorizeUrl } from "@/lib/discord";
import { loadEnv, oauthConfigured } from "@/lib/env";
import { RETURN_COOKIE, STATE_COOKIE } from "@/lib/session";

/** Only same-origin paths, so `next` can never bounce a user off-site. */
function safeReturnPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

export async function GET(request: Request) {
  const env = loadEnv();
  if (!oauthConfigured(env)) {
    return new Response("Discord OAuth is not configured on this server.", { status: 503 });
  }

  const url = new URL(request.url);
  const state = randomBytes(16).toString("hex");
  const secure = env.baseUrl.startsWith("https://");

  const jar = await cookies();
  jar.set(STATE_COOKIE, state, { httpOnly: true, secure, sameSite: "lax", maxAge: 600, path: "/" });
  jar.set(RETURN_COOKIE, safeReturnPath(url.searchParams.get("next")), {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return Response.redirect(authorizeUrl(env.discordClientId, `${env.baseUrl}/auth/callback`, state));
}
