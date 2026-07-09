import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import { deleteSession } from "@/lib/db/queries";
import { loadEnv } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/session";

export async function GET() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(getDb(), token);
  jar.delete(SESSION_COOKIE);
  return Response.redirect(new URL("/", loadEnv().baseUrl));
}
