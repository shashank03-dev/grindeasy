import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

// ProcessEnv insists on NODE_ENV, which none of these cases care about.
const processEnv = (vars: Record<string, string>) =>
  ({ NODE_ENV: "test", ...vars }) as NodeJS.ProcessEnv;

describe("loadEnv baseUrl", () => {
  // The OAuth state cookie is host-scoped: it is written on whatever host
  // baseUrl names and read back on the callback. Get baseUrl wrong and the
  // cookie lands where the callback cannot see it, so every sign-in 400s while
  // the rest of the site looks perfectly healthy. The blank case below is not
  // hypothetical — it is what production was actually running.
  it("uses BASE_URL when it is set", () => {
    expect(loadEnv(processEnv({ BASE_URL: "https://grindeasy.tech" })).baseUrl).toBe(
      "https://grindeasy.tech",
    );
  });

  it("treats a blank BASE_URL as absent and falls back to the Vercel domain", () => {
    const result = loadEnv(
      processEnv({ BASE_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "grindeasy.tech" }),
    );
    expect(result.baseUrl).toBe("https://grindeasy.tech");
  });

  it("treats a whitespace-only BASE_URL as absent", () => {
    const result = loadEnv(
      processEnv({ BASE_URL: "   ", VERCEL_PROJECT_PRODUCTION_URL: "grindeasy.tech" }),
    );
    expect(result.baseUrl).toBe("https://grindeasy.tech");
  });

  it("strips trailing slashes so callback URLs never double up", () => {
    expect(loadEnv(processEnv({ BASE_URL: "https://grindeasy.tech//" })).baseUrl).toBe(
      "https://grindeasy.tech",
    );
  });

  it("falls back to localhost when nothing is configured", () => {
    expect(loadEnv(processEnv({})).baseUrl).toBe("http://localhost:3000");
  });
});
