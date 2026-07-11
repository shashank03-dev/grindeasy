import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

// Lazy, and deliberately NOT a Proxy wrapper: libraries that inspect the client
// object break when a Proxy intercepts property checks. A plain function is
// enough to keep `next build` from evaluating this without DATABASE_URL set.

function create() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  return drizzle(new Pool({ connectionString }), { schema });
}

let db: ReturnType<typeof create> | null = null;

export function getDb() {
  if (!db) db = create();
  return db;
}
