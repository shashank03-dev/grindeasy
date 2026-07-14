import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Licensed faces, self-hosted, subset to latin (~60KB total). FF DIN Condensed
// Black is the display voice — compressed, industrial, only ever set large. FF DIN
// carries the working text. Akkurat Mono is the data voice: the board, the timers,
// the shell command. Changing a face means changing only the src paths here.
const dinCondensed = localFont({
  src: "../public/fonts/din-condensed-black.woff2",
  variable: "--font-din-condensed",
  weight: "900",
  display: "swap",
  fallback: ["Arial Narrow", "Impact", "sans-serif"],
});

const din = localFont({
  src: [
    { path: "../public/fonts/din-regular.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/din-bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-din",
  display: "swap",
  fallback: ["Helvetica Neue", "Arial", "sans-serif"],
});

const akkuratMono = localFont({
  src: "../public/fonts/akkurat-mono.woff2",
  variable: "--font-akkurat-mono",
  weight: "400",
  display: "swap",
  fallback: ["ui-monospace", "SFMono-Regular", "monospace"],
});

// Instrument Serif (SIL OFL, self-hosted) is the editorial counter-voice: italic
// lowercase words set inside the condensed caps. Accent only — never body text.
const instrumentSerif = localFont({
  src: [
    { path: "../public/fonts/instrument-serif.woff2", weight: "400", style: "normal" },
    { path: "../public/fonts/instrument-serif-italic.woff2", weight: "400", style: "italic" },
  ],
  variable: "--font-instrument-serif",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

// The landing's editorial voice (valeran-style rework): Maltiner Display is the
// big fashion serif for the hero, tool names and footer wordmark; The Neue Black
// (League of Moveable Type, OFL) is the letterspaced caps face for eyebrows.
const maltiner = localFont({
  src: "../public/fonts/maltiner.woff2",
  variable: "--font-maltiner",
  weight: "400",
  display: "swap",
  fallback: ["Georgia", "Times New Roman", "serif"],
});

const neueBlack = localFont({
  src: "../public/fonts/the-neue-black.woff2",
  variable: "--font-neue-black",
  weight: "900",
  display: "swap",
  fallback: ["Arial Narrow", "Impact", "sans-serif"],
});

export const metadata: Metadata = {
  title: "grindeasy · see what you're coding with",
  description:
    "A local agent that puts the AI tool you're actually using on your Discord profile, live. Claude Code, Codex, Cursor and more. It never reads your code.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${din.variable} ${dinCondensed.variable} ${akkuratMono.variable} ${instrumentSerif.variable} ${maltiner.variable} ${neueBlack.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
