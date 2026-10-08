import type { Metadata, Viewport } from "next";
import { GeistMono } from "geist/font/mono";
import { GeistPixelCircle, GeistPixelSquare } from "geist/font/pixel";
import { GeistSans } from "geist/font/sans";
import "./globals.css";

// One family, three registers. Geist Sans carries everything you read, set
// huge and tight for display. Geist Mono is the data voice: labels, paths,
// timers, the shell command. Geist Pixel is the screen itself — section
// numerals, ranks, the wordmark — the same pixel grid the dither field is
// drawn on, so type and image share one resolution. Pixel Circle is the
// dot-matrix variant, kept for live counters.
export const metadata: Metadata = {
  title: "grindeasy · show Discord what you're coding with",
  description:
    "A local agent that puts the AI tool you're actually using on your Discord profile, live. Claude Code, Codex, Cursor and more. It never reads your code.",
};

export const viewport: Viewport = {
  themeColor: "#08090a",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${GeistSans.variable} ${GeistMono.variable} ${GeistPixelSquare.variable} ${GeistPixelCircle.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
