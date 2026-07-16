import React from "react";
import { useCurrentFrame } from "remotion";
import { MONO, PALETTE, type Line } from "./theme";

const TrafficLight: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ width: 14, height: 14, borderRadius: 999, background: color }} />
);

type Props = {
  lines: Line[];
  showCursor?: boolean;
  width: number;
  height: number;
  fontSize?: number;
};

export const Terminal: React.FC<Props> = ({
  lines,
  showCursor = false,
  width,
  height,
  fontSize = 26,
}) => {
  const frame = useCurrentFrame();
  const cursorOn = Math.floor(frame / 16) % 2 === 0;

  return (
    <div
      style={{
        width,
        height,
        background: PALETTE.bg,
        borderRadius: 14,
        border: "1px solid #26302a",
        boxShadow: "0 40px 120px rgba(0,0,0,0.6)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          height: 52,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 10,
          background: "#12171400",
          borderBottom: "1px solid #1c231e",
        }}
      >
        <TrafficLight color="#e06c62" />
        <TrafficLight color="#e0b95f" />
        <TrafficLight color="#7fce7f" />
        <div
          style={{
            flex: 1,
            textAlign: "center",
            color: PALETTE.dimmer,
            fontFamily: MONO,
            fontSize: 18,
          }}
        >
          grindeasy — zsh
        </div>
        <div style={{ width: 42 }} />
      </div>

      <div
        style={{
          flex: 1,
          padding: "20px 30px 26px",
          fontFamily: MONO,
          fontSize,
          lineHeight: 1.5,
          color: PALETTE.fg,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          overflow: "hidden",
        }}
      >
        {lines.map((line, i) => {
          const isLast = i === lines.length - 1;
          return (
            <div
              key={i}
              style={{
                color: line.color ?? PALETTE.fg,
                fontWeight: line.bold ? 700 : 400,
                whiteSpace: "pre",
              }}
            >
              {line.text}
              {isLast && showCursor && cursorOn ? (
                <span style={{ color: PALETTE.phosphor }}>█</span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
};
