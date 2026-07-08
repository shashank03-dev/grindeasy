import { createServer, type Server } from "node:http";
import type { Snapshot } from "./snapshot.js";

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
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

export function renderPage(s: Snapshot): string {
  const activeLabel =
    s.activeNow.length > 0 ? esc(s.activeNow.join(" + ")) : "Idle";
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

  const nextLine =
    s.nextAtXp !== null
      ? `${(s.nextAtXp - s.xp).toFixed(1)} XP to next tier`
      : "Max tier reached";

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta http-equiv="refresh" content="5"/>
<title>viberank</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1d2233, #0c0e16 60%); color: #e7e9f0;
    min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .card { width: 100%; max-width: 460px; background: #141826; border: 1px solid #232838;
    border-radius: 18px; padding: 28px; box-shadow: 0 24px 60px rgba(0,0,0,.45); }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 700; letter-spacing: .3px; }
  .brand .dot { width: 10px; height: 10px; border-radius: 50%;
    background: ${s.activeNow.length ? "#4ade80" : "#6b7280"}; box-shadow: 0 0 12px ${s.activeNow.length ? "#4ade80" : "transparent"}; }
  .status { color: #9aa3b8; font-size: 13px; margin-top: 2px; }
  .tier { margin: 22px 0 6px; display: flex; align-items: baseline; gap: 10px; }
  .tier .glyph { font-size: 30px; }
  .tier .name { font-size: 30px; font-weight: 800; }
  .tier .badge { margin-left: auto; font-size: 12px; font-weight: 700; letter-spacing: 1px;
    padding: 4px 10px; border: 1px solid #33405e; border-radius: 999px; color: #b9c6ff; }
  .bar { height: 8px; background: #212739; border-radius: 999px; overflow: hidden; margin: 8px 0 4px; }
  .bar > i { display: block; height: 100%; width: ${s.progressPct.toFixed(1)}%;
    background: linear-gradient(90deg, #7c8cff, #b06bff); }
  .next { color: #8b93a7; font-size: 12px; }
  .grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin: 22px 0; }
  .stat { background: #0f1320; border: 1px solid #212739; border-radius: 12px; padding: 12px; text-align: center; }
  .stat b { display: block; font-size: 20px; }
  .stat span { color: #8b93a7; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; }
  .rows { border-top: 1px solid #212739; padding-top: 14px; }
  .row { display: flex; justify-content: space-between; padding: 5px 0; }
  .row.muted span { color: #6b7280; }
  .donate { display: block; text-align: center; margin-top: 22px; padding: 12px;
    background: linear-gradient(90deg, #ffb703, #fb8500); color: #201400; font-weight: 800;
    border-radius: 12px; text-decoration: none; }
  .foot { text-align: center; color: #5b6479; font-size: 11px; margin-top: 14px; }
</style></head>
<body><div class="card">
  <div>
    <div class="brand"><span class="dot"></span> viberank</div>
    <div class="status">${activeLabel}</div>
  </div>
  <div class="tier">
    <span class="glyph">${esc(s.tierGlyph)}</span>
    <span class="name">${esc(s.tierName)}</span>
    <span class="badge">${esc(s.planBadge)}</span>
  </div>
  <div class="bar"><i></i></div>
  <div class="next">${esc(nextLine)}</div>
  <div class="grid">
    <div class="stat"><b>${fmtHours(s.totalHours)}</b><span>Active</span></div>
    <div class="stat"><b>${s.combos}</b><span>Combos</span></div>
    <div class="stat"><b>${s.streakDays}🔥</b><span>Streak</span></div>
  </div>
  <div class="rows">${toolRows}</div>
  <a class="donate" href="${esc(s.donateUrl)}" target="_blank" rel="noopener">☕ Support viberank</a>
  <div class="foot">Local dashboard · nothing here leaves your machine</div>
</div></body></html>`;
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
