// Applies pending Drizzle migrations during a Vercel *production* build, before
// `next build` runs. Gated on VERCEL_ENV so preview deploys and local builds
// never touch the database — only a production deploy migrates. A failed
// migration fails the build on purpose, rather than shipping code against a
// schema that was never applied.
import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log(
    `[migrate] VERCEL_ENV=${process.env.VERCEL_ENV ?? "(unset)"} — skipping migrations (production only).`,
  );
  process.exit(0);
}

if (!process.env.DATABASE_URL) {
  console.error("[migrate] Production build but DATABASE_URL is not set. Aborting.");
  process.exit(1);
}

console.log("[migrate] Production deploy — applying pending migrations…");
const result = spawnSync("npx", ["drizzle-kit", "migrate"], { stdio: "inherit" });
process.exit(result.status ?? 1);
