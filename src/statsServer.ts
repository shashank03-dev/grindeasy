import { createServer, type Server } from "node:http";
import type { Snapshot } from "./snapshot.js";

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  aider: "Aider",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

function activeLabelOf(s: Snapshot): string {
  return s.activeNow.length > 0 ? s.activeNow.join(" + ") : "Idle";
}

function nextLineOf(s: Snapshot): string {
  return s.nextAtXp !== null
    ? `${(s.nextAtXp - s.xp).toFixed(1)} XP to next tier`
    : "Max tier reached";
}

function syncLineOf(s: Snapshot): string {
  if (s.sync === null) return "Local dashboard · nothing here leaves your machine";
  if (s.sync.status === "ok") return `Leaderboard sync ✓ · last ${s.sync.lastSyncAt ?? ""}`;
  if (s.sync.status === "error") return `Leaderboard sync failed: ${s.sync.lastError ?? "unknown"}`;
  return "Leaderboard sync pending…";
}

// Client-side updater: polls /api/stats and patches the DOM in place, so the
// page never does a full reload (no flash, no scroll reset, hover state kept).
// textContent is used throughout, so values are inserted safely without escaping.
const DASHBOARD_SCRIPT = `
const TOOL_LABELS = {
  "claude-code": "Claude Code", codex: "Codex", opencode: "OpenCode",
  cursor: "Cursor", "gemini-cli": "Gemini CLI", aider: "Aider"
};
function fmtHours(h) { return h < 1 ? Math.round(h * 60) + "m" : h.toFixed(1) + "h"; }
function syncText(s) {
  if (!s.sync) return "Local dashboard · nothing here leaves your machine";
  if (s.sync.status === "ok") return "Leaderboard sync ✓ · last " + (s.sync.lastSyncAt || "");
  if (s.sync.status === "error") return "Leaderboard sync failed: " + (s.sync.lastError || "unknown");
  return "Leaderboard sync pending…";
}
function makeRow(label, value, muted) {
  const el = document.createElement("div");
  el.className = muted ? "row muted" : "row";
  const a = document.createElement("span"); a.textContent = label;
  const b = document.createElement("b"); b.textContent = value;
  el.append(a, b); return el;
}
function set(id, v) { const n = document.getElementById(id); if (n) n.textContent = v; }
function apply(s) {
  const active = s.activeNow.length > 0;
  const dot = document.querySelector(".brand .dot");
  if (dot) dot.classList.toggle("active", active);
  set("status", active ? s.activeNow.join(" + ") : "Idle");
  set("tierGlyph", s.tierGlyph);
  set("tierName", s.tierName);
  set("badge", s.planBadge);
  set("next", s.nextAtXp !== null ? (s.nextAtXp - s.xp).toFixed(1) + " XP to next tier" : "Max tier reached");
  set("statHours", fmtHours(s.totalHours));
  set("statCombos", String(s.combos));
  set("statStreak", s.streakDays + "🔥");
  set("foot", syncText(s));
  const bar = document.getElementById("barFill");
  if (bar) bar.style.width = s.progressPct.toFixed(1) + "%";
  const chips = document.getElementById("chips");
  if (chips) chips.replaceChildren.apply(chips, s.achievements.map(function (a) {
    const el = document.createElement("span");
    el.className = a.earned ? "chip on" : "chip";
    el.title = a.detail; el.textContent = a.label; return el;
  }));
  const rows = document.getElementById("rows");
  if (rows) {
    if (s.perTool.length) {
      rows.replaceChildren.apply(rows, s.perTool.map(function (t) {
        return makeRow(TOOL_LABELS[t.id] || t.id, fmtHours(t.hours), false);
      }));
    } else {
      rows.replaceChildren(makeRow("No activity yet — start coding", "0m", true));
    }
  }
}
async function tick() {
  try {
    const r = await fetch("/api/stats", { cache: "no-store" });
    if (r.ok) apply(await r.json());
  } catch (e) { /* server restarting; keep the last good view */ }
}
setInterval(tick, 5000);
`;

export function renderPage(s: Snapshot): string {
  const toolRows = s.perTool.length
    ? s.perTool
        .map(
          (t) =>
            `<div class="row"><span>${esc(TOOL_LABELS[t.id] ?? t.id)}</span><b>${fmtHours(
              t.hours,
            )}</b></div>`,
        )
        .join("")
    : `<div class="row muted"><span>No activity yet — start coding</span><b>0m</b></div>`;

  const chips = s.achievements
    .map(
      (a) =>
        `<span class="chip${a.earned ? " on" : ""}" title="${esc(a.detail)}">${esc(a.label)}</span>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<noscript><meta http-equiv="refresh" content="15"/></noscript>
<title>grindeasy</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #13201a, #0a0d0c 60%); color: #e3e7e4;
    min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { width: 100%; max-width: 460px; background: #101412; border: 1px solid rgba(130,211,153,.12);
    border-radius: 18px; padding: 28px; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .3px; }
  .brand .dot { width: 10px; height: 10px; border-radius: 50%;
    background: #5b6b60; box-shadow: 0 0 12px transparent;
    transition: background .4s ease, box-shadow .4s ease; }
  .brand .dot.active { background: #82d399; box-shadow: 0 0 12px #82d399; }
  .status { color: #838b87; font-size: 13px; margin-top: 2px; }
  .tier { margin: 22px 0 6px; display: flex; align-items: baseline; gap: 10px; }
  .tier .glyph { font-size: 30px; }
  .tier .name { font-size: 30px; font-weight: 800; }
  .tier .badge { margin-left: auto; font-size: 12px; font-weight: 700; letter-spacing: 1px;
    padding: 4px 10px; border: 1px solid #2f5a3f; border-radius: 999px; color: #82d399; }
  .bar { height: 8px; background: #1a211d; border-radius: 999px; overflow: hidden; margin: 8px 0 4px; }
  .bar > i { display: block; height: 100%; width: ${s.progressPct.toFixed(1)}%;
    background: linear-gradient(90deg, #4b8057, #82d399); transition: width .5s ease; }
  .next { color: #838b87; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 22px 0; }
  .stat { background: #0c100e; border: 1px solid #1a211d; border-radius: 12px; padding: 12px; text-align: center; }
  .stat b { display: block; font-size: 20px; }
  .stat span { color: #838b87; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; }
  .chip { font-size: 11px; padding: 3px 9px; border-radius: 999px; border: 1px solid #1a211d;
    color: #5b6b60; }
  .chip.on { color: #82d399; border-color: #2f5a3f; background: rgba(130, 211, 153, .07); }
  .rows { border-top: 1px solid #1a211d; padding-top: 14px; }
  .row { display: flex; justify-content: space-between; padding: 5px 0; }
  .row.muted span { color: #5b6b60; }
  .donate { display: block; text-align: center; margin-top: 22px; padding: 12px;
    background: linear-gradient(90deg, #4b8057, #82d399); color: #09200f; font-weight: 800;
    border-radius: 12px; text-decoration: none; }
  .foot { text-align: center; color: #5b6b60; font-size: 11px; margin-top: 14px; }
</style></head>
<body><div class="card">
  <div>
    <div class="brand"><span class="dot${s.activeNow.length ? " active" : ""}"></span> grindeasy</div>
    <div class="status" id="status">${esc(activeLabelOf(s))}</div>
  </div>
  <div class="tier">
    <span class="glyph" id="tierGlyph">${esc(s.tierGlyph)}</span>
    <span class="name" id="tierName">${esc(s.tierName)}</span>
    <span class="badge" id="badge">${esc(s.planBadge)}</span>
  </div>
  <div class="bar"><i id="barFill"></i></div>
  <div class="next" id="next">${esc(nextLineOf(s))}</div>
  <div class="grid">
    <div class="stat"><b id="statHours">${fmtHours(s.totalHours)}</b><span>Active</span></div>
    <div class="stat"><b id="statCombos">${s.combos}</b><span>Combos</span></div>
    <div class="stat"><b id="statStreak">${s.streakDays}🔥</b><span>Streak</span></div>
  </div>
  <div class="chips" id="chips">${chips}</div>
  <div class="rows" id="rows">${toolRows}</div>
  <a class="donate" href="${esc(s.donateUrl)}" target="_blank" rel="noopener">☕ Support grindeasy</a>
  <div class="foot" id="foot">${esc(syncLineOf(s))}</div>
</div>
<script>${DASHBOARD_SCRIPT}</script>
</body></html>`;
}

/** Start the local stats web server. Returns the http.Server. */
export function startStatsServer(port: number, getSnapshot: () => Snapshot): Server {
  const server = createServer((req, res) => {
    if (req.url === "/api/stats") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(getSnapshot()));
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(renderPage(getSnapshot()));
  });
  server.on("error", (err) => {
    console.warn(`[stats] Could not start local dashboard on :${port} — ${err.message}`);
  });
  server.listen(port);
  return server;
}
