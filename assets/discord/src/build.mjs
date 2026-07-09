#!/usr/bin/env node
// Regenerates assets/discord/*.png from the SVG sources in this folder.
// Run from anywhere: `node assets/discord/src/build.mjs`
// Requires `sharp` (already a transitive dep under web/node_modules).
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharpPath = path.join(__dirname, "..", "..", "..", "web", "node_modules", "sharp", "lib", "index.js");
const { default: sharp } = await import(pathToFileURL(sharpPath).href);

const SRC = __dirname;
const OUT = path.join(__dirname, "..");

const BOLT = "62,4 24,47 46,47 39,96 76,53 55,53";

const PLAN_BADGES = [
  { key: "api", color: "#2DD4BF" },
  { key: "pro", color: "#FFB020" },
  { key: "max", color: "#FF3D8E" },
];

async function main() {
  await sharp(path.join(SRC, "mark.svg")).resize(1024, 1024).png().toFile(path.join(OUT, "viberank.png"));

  for (const p of PLAN_BADGES) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
      <circle cx="50" cy="50" r="48" fill="${p.color}"/>
      <polygon points="${BOLT}" fill="#0B0D12"/>
    </svg>`;
    await sharp(Buffer.from(svg)).resize(1024, 1024).png().toFile(path.join(OUT, `${p.key}.png`));
  }

  await sharp(path.join(SRC, "cover.svg")).resize(1024, 576).png().toFile(path.join(OUT, "invite-cover.png"));

  console.log("Wrote viberank.png, api.png, pro.png, max.png, invite-cover.png to", OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
