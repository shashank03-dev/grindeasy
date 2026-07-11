import { escapeHtml as esc } from "./http.js";
import type { BoardEntry } from "./leaderboard.js";
import type { UserRecord } from "./db.js";
import { planBadge } from "../../src/plan.js";
import { tierForXp, xpFromTotals } from "../../src/tiers.js";

const TOOL_LABELS: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
  "gemini-cli": "Gemini CLI",
  aider: "Aider",
};

export function toolLabel(id: string): string {
  return TOOL_LABELS[id] ?? id;
}

function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  return `${h.toFixed(1)}h`;
}

// Client-side updater for the leaderboard: polls /api/leaderboard and rebuilds
// the table body in place, so the board reflects new syncs without a full page
// reload. textContent is used for all values, so no escaping is needed.
const BOARD_SCRIPT = `
function fmtHours(h) { return h < 1 ? Math.round(h * 60) + "m" : h.toFixed(1) + "h"; }
function cell(cls, text) {
  const td = document.createElement("td");
  if (cls) td.className = cls;
  td.textContent = text; return td;
}
function renderBoard(entries) {
  const tb = document.getElementById("board");
  if (!tb) return;
  if (!entries.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td"); td.colSpan = 7;
    const d = document.createElement("div"); d.className = "empty";
    d.textContent = "No hunters on the board yet — be the first.";
    td.append(d); tr.append(td); tb.replaceChildren(tr); return;
  }
  tb.replaceChildren.apply(tb, entries.map(function (e) {
    const tr = document.createElement("tr");
    tr.append(cell("rank" + (e.rank <= 3 ? " top" : ""), "#" + e.rank));
    const userTd = document.createElement("td");
    const span = document.createElement("span"); span.className = "user";
    if (e.avatarUrl) {
      const img = document.createElement("img"); img.src = e.avatarUrl; img.alt = ""; span.append(img);
    } else {
      const ph = document.createElement("span"); ph.className = "ph"; span.append(ph);
    }
    span.append(document.createTextNode(e.username));
    userTd.append(span); tr.append(userTd);
    tr.append(cell("tier", e.tierGlyph + " " + e.tierName));
    const badgeTd = document.createElement("td");
    const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = e.planBadge;
    badgeTd.append(badge); tr.append(badgeTd);
    tr.append(cell("num", fmtHours(e.hours)));
    tr.append(cell("num", String(e.combos)));
    const xpTd = document.createElement("td"); xpTd.className = "num";
    const b = document.createElement("b"); b.textContent = e.xp.toFixed(1); xpTd.append(b); tr.append(xpTd);
    return tr;
  }));
}
async function tickBoard() {
  try {
    const r = await fetch("/api/leaderboard", { cache: "no-store" });
    if (r.ok) { const d = await r.json(); renderBoard(d.entries || []); }
  } catch (e) { /* server restarting; keep the last good board */ }
}
setInterval(tickBoard, 5000);
`;

function shell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: radial-gradient(1200px 600px at 50% -10%, #1d2233, #0c0e16 60%); color: #e7e9f0;
    min-height: 100vh; padding: 32px 16px; }
  .wrap { max-width: 760px; margin: 0 auto; }
  a { color: #9db1ff; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 20px; }
  .brand .dot { width: 10px; height: 10px; border-radius: 50%; background: #7c8cff; box-shadow: 0 0 12px #7c8cff; }
  .nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  .nav .links a { margin-left: 14px; text-decoration: none; font-weight: 600; font-size: 14px; }
  .hero { margin: 8px 0 26px; }
  .hero h1 { font-size: 28px; line-height: 1.25; }
  .hero p { color: #9aa3b8; margin-top: 8px; max-width: 560px; }
  .card { background: #141826; border: 1px solid #232838; border-radius: 18px; padding: 22px;
    box-shadow: 0 24px 60px rgba(0,0,0,.45); margin-bottom: 20px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; color: #8b93a7; font-size: 11px; text-transform: uppercase;
    letter-spacing: .6px; padding: 6px 8px; border-bottom: 1px solid #232838; }
  td { padding: 9px 8px; border-bottom: 1px solid #1a1f2e; }
  tr:last-child td { border-bottom: 0; }
  .rank { color: #8b93a7; width: 44px; font-variant-numeric: tabular-nums; }
  .rank.top { color: #ffd166; font-weight: 800; }
  .user { display: flex; align-items: center; gap: 10px; font-weight: 600; }
  .user img { width: 26px; height: 26px; border-radius: 50%; }
  .user .ph { width: 26px; height: 26px; border-radius: 50%; background: #232838; display: inline-block; }
  .tier { white-space: nowrap; }
  .badge { font-size: 11px; font-weight: 700; letter-spacing: 1px; padding: 3px 9px;
    border: 1px solid #33405e; border-radius: 999px; color: #b9c6ff; white-space: nowrap; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #8b93a7; font-size: 13px; }
  .btn { display: inline-block; padding: 10px 18px; border-radius: 10px; text-decoration: none;
    font-weight: 700; background: linear-gradient(90deg, #7c8cff, #b06bff); color: #0c0e16; }
  .btn.ghost { background: none; border: 1px solid #33405e; color: #b9c6ff; }
  pre { background: #0f1320; border: 1px solid #212739; border-radius: 12px; padding: 14px;
    overflow-x: auto; font-size: 13px; margin: 10px 0; }
  code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  h2 { font-size: 17px; margin-bottom: 10px; }
  .token { word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    background: #0f1320; border: 1px solid #212739; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
  .foot { text-align: center; color: #5b6479; font-size: 12px; margin-top: 26px; }
  .empty { text-align: center; color: #8b93a7; padding: 26px 0; }
</style></head>
<body><div class="wrap">${body}
<div class="foot">viberank · open source · <a href="https://github.com/shashank03-dev/viberank">GitHub</a> · only aggregate minutes ever leave your machine</div>
</div></body></html>`;
}

function nav(loggedIn: boolean): string {
  const right = loggedIn
    ? `<a href="/me">My profile</a><a href="/logout">Log out</a>`
    : `<a href="/auth/login">Log in with Discord</a>`;
  return `<div class="nav">
    <a href="/" style="text-decoration:none;color:inherit"><span class="brand"><span class="dot"></span> viberank</span></a>
    <span class="links">${right}</span>
  </div>`;
}

export function renderLanding(entries: BoardEntry[], loggedIn: boolean): string {
  const rows = entries.length
    ? entries
        .map((e) => {
          const avatar = e.avatarUrl
            ? `<img src="${esc(e.avatarUrl)}" alt=""/>`
            : `<span class="ph"></span>`;
          return `<tr>
            <td class="rank${e.rank <= 3 ? " top" : ""}">#${e.rank}</td>
            <td><span class="user">${avatar}${esc(e.username)}</span></td>
            <td class="tier">${esc(e.tierGlyph)} ${esc(e.tierName)}</td>
            <td><span class="badge">${esc(e.planBadge)}</span></td>
            <td class="num">${fmtHours(e.hours)}</td>
            <td class="num">${e.combos}</td>
            <td class="num"><b>${e.xp.toFixed(1)}</b></td>
          </tr>`;
        })
        .join("")
    : `<tr><td colspan="7"><div class="empty">No hunters on the board yet — be the first.</div></td></tr>`;

  return shell(
    "viberank — global leaderboard",
    `${nav(loggedIn)}
  <div class="hero">
    <h1>The global leaderboard for AI-assisted coding</h1>
    <p>viberank's local agent measures how much you <i>actively</i> code with Claude Code,
    Codex, OpenCode and friends — shows it on your Discord profile, and ranks you here.
    One board for everyone; the plan badge is context, never a multiplier.</p>
    <p style="margin-top:12px">
      <a class="btn" href="/auth/login">Join with Discord</a>
      <a class="btn ghost" href="https://github.com/shashank03-dev/viberank" style="margin-left:8px">Get the agent</a>
    </p>
  </div>
  <div class="card">
    <table>
      <thead><tr><th>Rank</th><th>Hunter</th><th>Tier</th><th>Plan</th>
        <th style="text-align:right">Active</th><th style="text-align:right">Combos</th><th style="text-align:right">XP</th></tr></thead>
      <tbody id="board">${rows}</tbody>
    </table>
  </div>
  <script>${BOARD_SCRIPT}</script>`,
  );
}

export function renderMe(
  user: UserRecord,
  agentToken: string,
  toolTotalsMs: Record<string, number>,
  baseUrl: string,
): string {
  const activeMs = Object.values(toolTotalsMs).reduce((a, b) => a + b, 0);
  const xp = xpFromTotals(activeMs, user.combos);
  const tier = tierForXp(xp);
  const toolRows = Object.entries(toolTotalsMs)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([id, ms]) =>
        `<tr><td>${esc(toolLabel(id))}</td><td class="num">${fmtHours(ms / 3_600_000)}</td></tr>`,
    )
    .join("");

  return shell(
    "viberank — my profile",
    `${nav(true)}
  <div class="card">
    <h2>${esc(user.username)} — ${esc(tier.glyph)} ${esc(tier.name)} <span class="badge">${esc(
      planBadge(user.plan),
    )}</span></h2>
    <p class="muted">${xp.toFixed(1)} XP · ${fmtHours(activeMs / 3_600_000)} active · ${user.combos} combos</p>
    ${toolRows ? `<table style="margin-top:12px"><tbody>${toolRows}</tbody></table>` : `<p class="muted" style="margin-top:12px">No synced activity yet — link your agent below and start coding.</p>`}
  </div>
  <div class="card">
    <h2>Link your agent</h2>
    <p class="muted">This token identifies <b>your</b> agent. Treat it like a password — anyone
    who has it can submit stats as you.</p>
    <div class="token" style="margin:12px 0">${esc(agentToken)}</div>
    <p class="muted">Add both lines to <code>~/.viberank/config.json</code>, then restart the agent:</p>
    <pre><code>{
  "serverUrl": "${esc(baseUrl)}",
  "accountToken": "${esc(agentToken)}"
}</code></pre>
    <p class="muted">The agent syncs every 5 minutes and only ever sends aggregate
    minutes per tool, combo count and plan label — never code, prompts or keys.</p>
  </div>`,
  );
}

/**
 * The device-pairing approval page. Deliberately blunt about what's being
 * authorized: a device flow's one real weakness is a user approving a code an
 * attacker generated, and the only defence is that the user understands the
 * code should have come from their own terminal.
 */
export function renderPair(user: UserRecord, code: string, error?: string): string {
  return shell(
    "viberank — link your agent",
    `${nav(true)}
  <div class="card">
    <h2>Link this device to ${esc(user.username)}</h2>
    <p class="muted">Your terminal is showing a code. Check it matches the one below,
    then approve — this lets that agent submit coding time as you.</p>
    ${error ? `<p style="color:#ff6b6b;margin-top:12px">${esc(error)}</p>` : ""}
    <form method="post" action="/pair" style="margin-top:14px">
      <input class="token" name="code" value="${esc(code)}" autocomplete="off"
             spellcheck="false" style="width:100%;box-sizing:border-box;text-transform:uppercase"/>
      <p style="margin-top:14px">
        <button class="btn" type="submit">Approve this device</button>
        <a class="btn ghost" href="/" style="margin-left:8px">Cancel</a>
      </p>
    </form>
    <p class="muted" style="margin-top:14px">If you didn't just start <code>viberank</code>
    in a terminal, don't approve this — someone else may be trying to link their agent
    to your account.</p>
  </div>`,
  );
}

export function renderMessage(title: string, message: string): string {
  return shell(
    `viberank — ${title}`,
    `${nav(false)}<div class="card"><h2>${esc(title)}</h2><p class="muted">${esc(message)}</p>
     <p style="margin-top:14px"><a class="btn ghost" href="/">← Back to the board</a></p></div>`,
  );
}
