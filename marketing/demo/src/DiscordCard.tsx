import React from "react";
import { PALETTE } from "./theme";

// The climbing-chevron "ascent" mark, drawn to match the CLI banner and the
// Discord large image.
const AscentMark: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
    <defs>
      <linearGradient id="ascent" x1="0" y1="100" x2="0" y2="0">
        <stop offset="0" stopColor={PALETTE.deep} />
        <stop offset="1" stopColor={PALETTE.phosphor} />
      </linearGradient>
    </defs>
    <path
      d="M50 20 L78 72 L64 72 L50 44 L36 72 L22 72 Z"
      fill="url(#ascent)"
    />
    <path
      d="M50 38 L66 70 L58 70 L50 54 L42 70 L34 70 Z"
      fill={PALETTE.bg}
      opacity="0.55"
    />
  </svg>
);

type Props = {
  detail: string; // "Coding · Claude Code + Codex"
  state: string; // "#12 on grindeasy · ◆ Platinum · PRO"
  elapsed: string; // "02:14:59"
};

export const DiscordCard: React.FC<Props> = ({ detail, state, elapsed }) => {
  return (
    <div
      style={{
        width: 620,
        background: "#111214",
        borderRadius: 16,
        border: "1px solid #26282c",
        boxShadow: "0 30px 80px rgba(0,0,0,0.55)",
        padding: 26,
        fontFamily:
          "'gg sans', 'Helvetica Neue', Helvetica, Arial, sans-serif",
        color: "#f2f3f5",
      }}
    >
      <div
        style={{
          fontSize: 15,
          letterSpacing: 0.6,
          fontWeight: 700,
          color: "#b5bac1",
          textTransform: "uppercase",
          marginBottom: 18,
        }}
      >
        Playing grindeasy
      </div>

      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        <div style={{ position: "relative", flexShrink: 0 }}>
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 12,
              background: PALETTE.bg,
              border: `1px solid ${PALETTE.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: `0 0 40px ${PALETTE.deep}55`,
            }}
          >
            <AscentMark size={62} />
          </div>
          <div
            style={{
              position: "absolute",
              right: -10,
              bottom: -10,
              width: 40,
              height: 40,
              borderRadius: 999,
              background: PALETTE.phosphor,
              color: PALETTE.bg,
              fontSize: 13,
              fontWeight: 800,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              border: "3px solid #111214",
            }}
          >
            PRO
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ fontSize: 25, fontWeight: 700, marginBottom: 8 }}>
            {detail}
          </div>
          <div style={{ fontSize: 20, color: "#c6ccd2", marginBottom: 8 }}>
            {state}
          </div>
          <div style={{ fontSize: 19, color: PALETTE.phosphor, fontVariantNumeric: "tabular-nums" }}>
            {elapsed} elapsed
          </div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 14, marginTop: 22 }}>
        {["Get grindeasy", "Support"].map((label, i) => (
          <div
            key={label}
            style={{
              flex: 1,
              textAlign: "center",
              padding: "13px 0",
              borderRadius: 8,
              fontSize: 18,
              fontWeight: 600,
              background: i === 0 ? PALETTE.phosphor : "#2b2d31",
              color: i === 0 ? PALETTE.bg : "#f2f3f5",
            }}
          >
            {label}
          </div>
        ))}
      </div>
    </div>
  );
};
