import { Pool, type PoolClient } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Lazy, and deliberately NOT a Proxy wrapper: libraries that inspect the client
// object break when a Proxy intercepts property checks. A plain function is
// enough to keep `next build` from evaluating this without DATABASE_URL set.

// Neon's serverless compute auto-suspends when idle, and the first connection
// after a suspend fails while the compute wakes (1-5s). Retry the CONNECTION,
// so a cold start doesn't 500 the first request. Warm requests connect on
// attempt 1 with no added latency.
//
// The budget is deliberately small. Every attempt can burn the full connect
// timeout, so worst case is ATTEMPTS * CONNECT_TIMEOUT_MS + backoff ~= 13s. If
// Neon is genuinely down, failing in 13s is better for every queued visitor
// than holding a serverless function open for half a minute.
const ATTEMPTS = 4;
const CONNECT_TIMEOUT_MS = 3_000;
const backoffMs = (attempt: number) => Math.min(1_000, 250 * attempt);

/**
 * True only for failures to ESTABLISH a connection. Anything the database
 * itself answered — bad SQL, a constraint violation, a failed password — must
 * surface immediately; retrying it would just fail slower.
 *
 * This is only ever applied to `pool.connect()`, so by construction no
 * statement has been dispatched yet. The WebSocket transport reports a failed
 * connect as a bare DOM ErrorEvent with no message, so it is matched
 * structurally rather than by text.
 */
function isTransientConnectionError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;

  const e = err as { type?: string; message?: string; code?: string };
  if (!(err instanceof Error) && e.type === "error") return true;
  if (typeof e.code === "string") {
    if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENETUNREACH", "EAI_AGAIN"].includes(e.code)) {
      return true;
    }
  }
  return /Error connecting to database|fetch failed|socket hang up|Connection terminated|timeout exceeded/i.test(
    e.message ?? "",
  );
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Neon is reached over the public internet, so a connection can fail before a
 * query is ever sent: a compute waking from auto-suspend, or an unlucky TCP
 * timeout. Unretried, one such blip 500s whatever page happened to be
 * rendering.
 *
 * Retry is applied to connection acquisition ONLY, never to a statement. A
 * connection that drops mid-query is not retried: the server may already have
 * applied the write, so re-sending it would double-insert (or fail on its own
 * unique index). Acquisition is the only step that is safely idempotent.
 */
function resilient(pool: Pool): Pool {
  // Untyped on purpose: pg-pool's connect() is an overload set (promise form and
  // callback form) and both are forwarded below.
  const connect = pool.connect.bind(pool) as (...args: unknown[]) => unknown;

  const acquire = async (): Promise<PoolClient> => {
    for (let attempt = 1; ; attempt++) {
      try {
        return (await connect()) as PoolClient;
      } catch (err) {
        if (attempt >= ATTEMPTS || !isTransientConnectionError(err)) throw err;
        await delay(backoffMs(attempt));
      }
    }
  };

  // Drizzle takes two paths into the pool, and both must go through `acquire`:
  //   - plain queries call pool.query()
  //   - db.transaction() calls pool.connect() and runs BEGIN/…/COMMIT on the
  //     checked-out client
  // pg-pool's own query() acquires internally via the callback form of
  // connect(), which would bypass the retry, so query() is reimplemented here
  // on top of acquire() rather than delegating to it.
  pool.connect = ((cb?: unknown) =>
    typeof cb === "function" ? connect(cb) : acquire()) as typeof pool.connect;

  const originalQuery = pool.query.bind(pool) as (...args: unknown[]) => unknown;
  pool.query = ((...args: unknown[]) => {
    // The callback form is passed straight through — drizzle never uses it, and
    // rebuilding its semantics on top of a promise would swallow the callback.
    if (typeof args[args.length - 1] === "function") return originalQuery(...args);

    return (async () => {
      const client = (await acquire()) as PoolClient & {
        query: (...a: unknown[]) => Promise<unknown>;
      };
      try {
        return await client.query(...args);
      } finally {
        client.release();
      }
    })();
  }) as typeof pool.query;

  // A pooled connection can die while idle — Neon closes it after a suspend.
  // pg-pool re-emits that on the pool, and an 'error' event with no listener is
  // an uncaught exception that would take down the whole serverless instance,
  // including unrelated in-flight requests. Acquisition-time retry handles the
  // recovery; this listener just keeps the idle death from being fatal.
  pool.on("error", () => {});

  return pool;
}

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  // Without a bound, a connect to a black-holed address hangs on the OS TCP
  // timeout (~30s) and the retries stack up into a minutes-long request.
  // Failing fast is what makes retrying worth doing.
  const pool = new Pool({ connectionString, connectionTimeoutMillis: CONNECT_TIMEOUT_MS });
  return drizzle(resilient(pool), { schema });
}

let db: ReturnType<typeof create> | null = null;

export function getDb() {
  if (!db) db = create();
  return db;
}
