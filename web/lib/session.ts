import { cookies } from "next/headers";
import { getDb } from "./db";
import { getSessionUser, type UserRecord } from "./db/queries";

export const SESSION_COOKIE = "vr_session";
export const STATE_COOKIE = "vr_oauth_state";
/** Where to return after a login that was started from a pairing link. */
export const RETURN_COOKIE = "vr_return_to";

export const SESSION_MAX_AGE_S = 30 * 86_400;

export async function currentUser(): Promise<UserRecord | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return getSessionUser(getDb(), token);
}
