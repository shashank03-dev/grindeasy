import React from "react";
import {
  AbsoluteFill,
  interpolate,
  useCurrentFrame,
  Easing,
} from "remotion";
import { MONO, PALETTE, type Line } from "./theme";
import { Terminal } from "./Terminal";
import { DiscordCard } from "./DiscordCard";

const { phosphor, deep, dim, dimmer, border, fg, bg } = PALETTE;

const ease = Easing.bezier(0.16, 1, 0.3, 1);
const clampOpts = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

// The command that gets typed, one char at a time.
const CMD = "npx grindeasy";
const TYPE_START = 66;
const TYPE_PER_CHAR = 3;
const ENTER = TYPE_START + CMD.length * TYPE_PER_CHAR + 6;

// Tool rows, generated so the columns align regardless of name length.
const toolRow = (mark: string, name: string, status: string) =>
  `  ${mark} ${name.padEnd(14)}${status}`;

// Every line of terminal output, with the frame it appears on.
type Event = { at: number; line: Line };
const OUTPUT: Event[] = [
  { at: ENTER + 8, line: { text: "     ╱╲", color: phosphor } },
  { at: ENTER + 12, line: { text: "    ╱  ╲    grindeasy", color: phosphor, bold: true } },
  { at: ENTER + 16, line: { text: "   ╱ ╱╲ ╲  ────────────", color: deep } },
  { at: ENTER + 20, line: { text: "  ╱ ╱  ╲ ╲ track the climb", color: deep } },
  { at: ENTER + 30, line: { text: "" } },
  { at: ENTER + 40, line: { text: "◇  setup", color: dim } },
  { at: ENTER + 58, line: { text: "◒  Scanning for AI coding tools…", color: dim } },
  { at: ENTER + 92, line: { text: "◇  6 tracked · 1 new", color: phosphor } },
  { at: ENTER + 104, line: { text: "" } },
  { at: ENTER + 112, line: { text: "  tools", color: dim } },
  { at: ENTER + 120, line: { text: toolRow("●", "Claude Code", "active"), color: phosphor } },
  { at: ENTER + 126, line: { text: toolRow("●", "Codex", "active"), color: phosphor } },
  { at: ENTER + 132, line: { text: toolRow("●", "Cursor", "tracking"), color: fg } },
  { at: ENTER + 138, line: { text: toolRow("●", "OpenCode", "tracking"), color: fg } },
  { at: ENTER + 144, line: { text: toolRow("●", "Gemini CLI", "tracking"), color: fg } },
  { at: ENTER + 150, line: { text: toolRow("●", "Aider", "tracking"), color: fg } },
  { at: ENTER + 156, line: { text: toolRow("○", "Zed", "detected"), color: dimmer } },
  { at: ENTER + 168, line: { text: "" } },
  { at: ENTER + 178, line: { text: "◆  Join the global leaderboard?  Yes", color: fg } },
  { at: ENTER + 208, line: { text: "" } },
  { at: ENTER + 214, line: { text: "   confirm in your browser", color: dim } },
  { at: ENTER + 220, line: { text: "   WXQ7-K2F9", color: phosphor, bold: true } },
  { at: ENTER + 226, line: { text: "   grindeasy.tech/activate", color: dim } },
  { at: ENTER + 262, line: { text: "" } },
  { at: ENTER + 270, line: { text: "◇  Joined — your rank now shows on your card.", color: phosphor } },
  { at: ENTER + 300, line: { text: "◆  Keep tracking in the background?  Yes", color: fg } },
  { at: ENTER + 336, line: { text: "◇  service installed · restarts on reboot", color: deep } },
  { at: ENTER + 356, line: { text: "└  Tracking starts now.", color: dim } },
];

const CARD_IN = ENTER + 380;
const CTA_IN = CARD_IN + 210;

function buildLines(frame: number): Line[] {
  const lines: Line[] = [];
  if (frame >= TYPE_START - 4) {
    const typed = Math.max(
      0,
      Math.min(CMD.length, Math.floor((frame - TYPE_START) / TYPE_PER_CHAR)),
    );
    const shown = frame >= ENTER ? CMD : CMD.slice(0, typed);
    lines.push({ text: `$ ${shown}`, color: fg });
  }
  for (const ev of OUTPUT) {
    if (frame >= ev.at) lines.push(ev.line);
  }
  return lines;
}

function formatElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}`;
}

const BrandIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 12, 52, 74], [0, 1, 1, 0], clampOpts);
  const scale = interpolate(frame, [0, 20], [0.9, 1], { ...clampOpts, easing: ease });
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        opacity,
        pointerEvents: "none",
      }}
    >
      <div style={{ textAlign: "center", scale: String(scale) }}>
        <svg width={120} height={120} viewBox="0 0 100 100">
          <defs>
            <linearGradient id="intro" x1="0" y1="100" x2="0" y2="0">
              <stop offset="0" stopColor={deep} />
              <stop offset="1" stopColor={phosphor} />
            </linearGradient>
          </defs>
          <path d="M50 18 L80 74 L64 74 L50 44 L36 74 L20 74 Z" fill="url(#intro)" />
        </svg>
        <div
          style={{
            fontFamily: MONO,
            fontSize: 58,
            fontWeight: 700,
            color: phosphor,
            marginTop: 14,
            letterSpacing: 2,
          }}
        >
          grindeasy
        </div>
        <div style={{ fontFamily: MONO, fontSize: 24, color: dim, marginTop: 10 }}>
          track the climb
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const GrindeasyDemo: React.FC = () => {
  const frame = useCurrentFrame();

  const termOpacity = interpolate(
    frame,
    [34, 56, CTA_IN - 20, CTA_IN + 8],
    [0, 1, 1, 0],
    clampOpts,
  );
  const termScale = interpolate(frame, [34, 56], [0.96, 1], { ...clampOpts, easing: ease });
  const termDim = interpolate(frame, [CARD_IN - 6, CARD_IN + 26], [0, 0.72], clampOpts);

  const cardOpacity = interpolate(
    frame,
    [CARD_IN, CARD_IN + 26, CTA_IN - 16, CTA_IN + 4],
    [0, 1, 1, 0],
    clampOpts,
  );
  const cardX = interpolate(frame, [CARD_IN, CARD_IN + 30], [90, 0], {
    ...clampOpts,
    easing: ease,
  });

  const ctaOpacity = interpolate(frame, [CTA_IN + 4, CTA_IN + 30], [0, 1], clampOpts);
  const ctaScale = interpolate(frame, [CTA_IN + 4, CTA_IN + 34], [0.94, 1], {
    ...clampOpts,
    easing: ease,
  });

  const elapsed = formatElapsed(8090 + Math.max(0, Math.floor((frame - CARD_IN) / 30)));

  return (
    <AbsoluteFill style={{ background: "#07100b" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(1100px 700px at 50% 34%, ${deep}22, transparent 70%), radial-gradient(900px 900px at 82% 88%, ${phosphor}12, transparent 68%)`,
        }}
      />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: termOpacity, scale: String(termScale) }}>
          <Terminal lines={buildLines(frame)} showCursor={frame < ENTER} width={1030} height={604} />
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: "#040807", opacity: termDim, pointerEvents: "none" }} />

      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
        <div style={{ opacity: cardOpacity, translate: `${cardX}px 0` }}>
          <DiscordCard
            detail="Coding · Claude Code + Codex"
            state="#12 on grindeasy · ◆ Platinum · PRO"
            elapsed={elapsed}
          />
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          opacity: ctaOpacity,
          pointerEvents: "none",
        }}
      >
        <div style={{ textAlign: "center", scale: String(ctaScale) }}>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 30,
              color: dim,
              marginBottom: 18,
            }}
          >
            one line. that's the install.
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 60,
              fontWeight: 700,
              color: phosphor,
              background: bg,
              border: `1px solid ${border}`,
              borderRadius: 14,
              padding: "22px 46px",
              display: "inline-block",
            }}
          >
            $ npx grindeasy
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 26,
              color: fg,
              marginTop: 34,
            }}
          >
            free · open source · never reads your code
          </div>
          <div
            style={{
              fontFamily: MONO,
              fontSize: 24,
              color: deep,
              marginTop: 14,
            }}
          >
            grindeasy.tech
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
