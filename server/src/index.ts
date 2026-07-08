#!/usr/bin/env node
import { createServer } from "node:http";
import { Store } from "./db.js";
import { loadEnv, oauthConfigured } from "./env.js";
import { createHandler } from "./router.js";

const env = loadEnv();
const store = new Store(env.dbPath);
const handler = createHandler({ store, env });

const server = createServer((req, res) => {
  void handler(req, res);
});

server.listen(env.port, () => {
  console.log(`⚡ viberank-server listening on :${env.port}`);
  console.log(`   base url  ${env.baseUrl}`);
  console.log(`   database  ${env.dbPath}`);
  console.log(
    `   oauth     ${
      oauthConfigured(env)
        ? `configured (redirect: ${env.baseUrl}/auth/callback)`
        : "NOT configured — set DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET to enable login"
    }`,
  );
});

function shutdown(): void {
  console.log("\n[viberank-server] shutting down…");
  server.close(() => {
    store.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
