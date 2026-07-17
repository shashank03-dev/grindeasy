import { createServer, type Server } from "node:http";
import type { DayHours, MonthlyWeek, Records, Snapshot, TopTool } from "./snapshot.js";

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

/** Single-letter weekday initial for a YYYY-MM-DD key (Sun→S … Sat→S). */
function weekdayLetter(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return "SMTWTFS"[new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay()] ?? "";
}

/** Shown in place of a delta when there's no prior week to compare against. */
const FIRST_WEEK_TEXT = "first week tracked";

function deltaText(delta: number): string {
  if (Math.abs(delta) < 0.05) return "level with last week";
  return `${delta > 0 ? "▲" : "▼"} ${fmtHours(Math.abs(delta))} vs last week`;
}

function topText(top: TopTool | null): string {
  return top ? `${TOOL_LABELS[top.id] ?? top.id} · ${Math.round(top.sharePct)}%` : "—";
}

function goalText(activeHours: number, goalHours: number, goalPct: number): string {
  return `${fmtHours(activeHours)} / ${fmtHours(goalHours)} · ${Math.round(goalPct)}%`;
}

function recordsText(r: Records): string {
  return r.bestWeekHours > 0
    ? `Best week ${fmtHours(r.bestWeekHours)} · Longest streak ${r.longestStreak}d`
    : "No full week logged yet";
}

/** Seven day-height bars (server-side initial paint; the client rebuilds these). */
function dayBars(perDay: DayHours[]): string {
  const max = Math.max(0.0001, ...perDay.map((d) => d.hours));
  return perDay
    .map((d) => {
      const pct = d.hours > 0 ? Math.max(6, Math.round((d.hours / max) * 100)) : 2;
      return `<div class="daybar"><i style="height:${pct}%"></i><span>${weekdayLetter(d.day)}</span></div>`;
    })
    .join("");
}

/** Four labelled week bars for the monthly trend. */
function monthRows(monthly: MonthlyWeek[]): string {
  const max = Math.max(0.0001, ...monthly.map((w) => w.hours));
  return monthly
    .map((w) => {
      const pct = w.hours > 0 ? Math.max(3, Math.round((w.hours / max) * 100)) : 0;
      const tool = w.mostUsedToolId ? TOOL_LABELS[w.mostUsedToolId] ?? w.mostUsedToolId : "—";
      return `<div class="mrow"><span class="mlabel">${esc(w.label)}</span><div class="mbar"><i style="width:${pct}%"></i></div><b>${fmtHours(
        w.hours,
      )}</b><span class="mtool">${esc(tool)}</span></div>`;
    })
    .join("");
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
function label(id) { return TOOL_LABELS[id] || id; }
function weekdayLetter(key) {
  const p = key.split("-"); const d = new Date(+p[0], +p[1] - 1, +p[2]);
  return "SMTWTFS"[d.getDay()] || "";
}
function deltaText(delta) {
  if (Math.abs(delta) < 0.05) return "level with last week";
  return (delta > 0 ? "▲ " : "▼ ") + fmtHours(Math.abs(delta)) + " vs last week";
}
function topText(top) { return top ? label(top.id) + " · " + Math.round(top.sharePct) + "%" : "—"; }
function applyWeekly(w) {
  set("wHours", fmtHours(w.activeHours));
  set("wDelta", w.isFirstWeek ? ${JSON.stringify(FIRST_WEEK_TEXT)} : deltaText(w.deltaHours));
  set("wAvg", fmtHours(w.avgHoursPerDay) + "/day");
  set("wDays", w.activeDays + " of 7 days");
  set("wBest", w.bestDay ? fmtHours(w.bestDay.hours) : "—");
  set("wTop", topText(w.mostUsedTool));
  const bars = document.getElementById("wBars");
  if (bars) {
    const max = Math.max.apply(null, w.perDay.map(function (d) { return d.hours; }).concat([0.0001]));
    bars.replaceChildren.apply(bars, w.perDay.map(function (d) {
      const col = document.createElement("div"); col.className = "daybar";
      const i = document.createElement("i");
      i.style.height = (d.hours > 0 ? Math.max(6, Math.round(d.hours / max * 100)) : 2) + "%";
      const s = document.createElement("span"); s.textContent = weekdayLetter(d.day);
      col.append(i, s); return col;
    }));
  }
  const goal = document.getElementById("wGoal");
  if (goal) {
    if (w.goalPct === null) { goal.style.display = "none"; }
    else {
      goal.style.display = "";
      const gf = document.getElementById("wGoalFill");
      if (gf) gf.style.width = Math.min(100, w.goalPct).toFixed(0) + "%";
      set("wGoalText", fmtHours(w.activeHours) + " / " + fmtHours(w.goalHours) + " · " + Math.round(w.goalPct) + "%");
    }
  }
}
function applyMonthly(m) {
  const box = document.getElementById("mRows");
  if (!box) return;
  const max = Math.max.apply(null, m.map(function (w) { return w.hours; }).concat([0.0001]));
  box.replaceChildren.apply(box, m.map(function (w) {
    const row = document.createElement("div"); row.className = "mrow";
    const lab = document.createElement("span"); lab.className = "mlabel"; lab.textContent = w.label;
    const bar = document.createElement("div"); bar.className = "mbar";
    const i = document.createElement("i");
    i.style.width = (w.hours > 0 ? Math.max(3, Math.round(w.hours / max * 100)) : 0) + "%";
    bar.append(i);
    const b = document.createElement("b"); b.textContent = fmtHours(w.hours);
    const tool = document.createElement("span"); tool.className = "mtool";
    tool.textContent = w.mostUsedToolId ? label(w.mostUsedToolId) : "—";
    row.append(lab, bar, b, tool); return row;
  }));
}
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
  set("wRecords", s.records.bestWeekHours > 0
    ? "Best week " + fmtHours(s.records.bestWeekHours) + " · Longest streak " + s.records.longestStreak + "d"
    : "No full week logged yet");
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
        return makeRow(label(t.id), fmtHours(t.hours), false);
      }));
    } else {
      rows.replaceChildren(makeRow("No activity yet — start coding", "0m", true));
    }
  }
  applyWeekly(s.weekly);
  applyMonthly(s.monthly);
}
function showView(v) {
  ["weekly", "alltime", "monthly"].forEach(function (name) {
    const view = document.getElementById("view-" + name);
    if (view) view.classList.toggle("active", name === v);
    const btn = document.querySelector('.tab[data-view="' + name + '"]');
    if (btn) btn.classList.toggle("on", name === v);
  });
}
document.querySelectorAll(".tab").forEach(function (btn) {
  btn.addEventListener("click", function () { showView(btn.getAttribute("data-view")); });
});
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

  const w = s.weekly;
  const goalHidden = w.goalPct === null;
  const goalWidth = w.goalPct !== null ? Math.min(100, w.goalPct).toFixed(0) : "0";

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
  .tabs { display: flex; gap: 4px; background: #0c100e; border: 1px solid #1a211d;
    border-radius: 999px; padding: 4px; margin: 22px 0 18px; }
  .tab { flex: 1; text-align: center; font: inherit; font-size: 12px; font-weight: 700;
    color: #838b87; background: transparent; border: 0; border-radius: 999px;
    padding: 7px 0; cursor: pointer; transition: color .2s, background .2s; }
  .tab.on { color: #09200f; background: linear-gradient(90deg, #4b8057, #82d399); }
  .view { display: none; }
  .view.active { display: block; }
  .whead { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
  .whead b { font-size: 30px; font-weight: 800; }
  .whead span { color: #838b87; font-size: 12px; }
  .bars { display: flex; align-items: flex-end; gap: 6px; height: 64px; margin: 4px 0 18px; }
  .daybar { flex: 1; display: flex; flex-direction: column; align-items: center; height: 100%;
    justify-content: flex-end; gap: 4px; }
  .daybar i { display: block; width: 100%; border-radius: 4px 4px 0 0;
    background: linear-gradient(180deg, #82d399, #4b8057); transition: height .5s ease; }
  .daybar span { color: #5b6b60; font-size: 10px; }
  .wgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .wstat { background: #0c100e; border: 1px solid #1a211d; border-radius: 12px; padding: 12px; }
  .wstat span { display: block; color: #838b87; font-size: 11px; text-transform: uppercase; letter-spacing: .6px; }
  .wstat b { font-size: 18px; }
  .goal { margin-top: 14px; }
  .goalbar { height: 10px; background: #1a211d; border-radius: 999px; overflow: hidden; }
  .goalbar > i { display: block; height: 100%; background: linear-gradient(90deg, #4b8057, #82d399);
    transition: width .5s ease; }
  .goaltext { color: #838b87; font-size: 12px; margin-top: 6px; }
  .wrec { color: #5b6b60; font-size: 12px; margin-top: 16px; text-align: center; }
  .mrow { display: grid; grid-template-columns: 78px 1fr auto; align-items: center;
    gap: 10px; padding: 8px 0; }
  .mrow .mlabel { color: #838b87; font-size: 12px; }
  .mrow .mbar { height: 10px; background: #1a211d; border-radius: 999px; overflow: hidden; }
  .mrow .mbar > i { display: block; height: 100%; background: linear-gradient(90deg, #4b8057, #82d399);
    transition: width .5s ease; }
  .mrow b { font-size: 13px; }
  .mrow .mtool { grid-column: 2 / 4; color: #5b6b60; font-size: 11px; }
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

  <div class="tabs">
    <button class="tab on" data-view="weekly">Weekly</button>
    <button class="tab" data-view="alltime">All-time</button>
    <button class="tab" data-view="monthly">Monthly</button>
  </div>

  <div class="view active" id="view-weekly">
    <div class="whead"><b id="wHours">${fmtHours(w.activeHours)}</b><span id="wDelta">${esc(
      w.isFirstWeek ? FIRST_WEEK_TEXT : deltaText(w.deltaHours),
    )}</span></div>
    <div class="bars" id="wBars">${dayBars(w.perDay)}</div>
    <div class="wgrid">
      <div class="wstat"><span>Avg / day</span><b id="wAvg">${fmtHours(w.avgHoursPerDay)}/day</b></div>
      <div class="wstat"><span>Consistency</span><b id="wDays">${w.activeDays} of 7 days</b></div>
      <div class="wstat"><span>Best day</span><b id="wBest">${
        w.bestDay ? fmtHours(w.bestDay.hours) : "—"
      }</b></div>
      <div class="wstat"><span>Top tool</span><b id="wTop">${esc(topText(w.mostUsedTool))}</b></div>
    </div>
    <div class="goal" id="wGoal"${goalHidden ? ' style="display:none"' : ""}>
      <div class="goalbar"><i id="wGoalFill" style="width:${goalWidth}%"></i></div>
      <div class="goaltext" id="wGoalText">${
        w.goalPct !== null ? esc(goalText(w.activeHours, w.goalHours, w.goalPct)) : ""
      }</div>
    </div>
    <div class="wrec" id="wRecords">${esc(recordsText(s.records))}</div>
  </div>

  <div class="view" id="view-alltime">
    <div class="grid">
      <div class="stat"><b id="statHours">${fmtHours(s.totalHours)}</b><span>Active</span></div>
      <div class="stat"><b id="statCombos">${s.combos}</b><span>Combos</span></div>
      <div class="stat"><b id="statStreak">${s.streakDays}🔥</b><span>Streak</span></div>
    </div>
    <div class="chips" id="chips">${chips}</div>
    <div class="rows" id="rows">${toolRows}</div>
  </div>

  <div class="view" id="view-monthly">
    <div class="mrows" id="mRows">${monthRows(s.monthly)}</div>
  </div>

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
