import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

/**
 * An in-process Postgres for tests, built by running the *real* migrations from
 * drizzle/. If a migration is wrong, these tests fail rather than production.
 */
export async function makeTestDb() {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
