import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  Instrument_Sans,
  Instrument_Serif,
  JetBrains_Mono,
} from "next/font/google";
import "./globals.css";

/**
 * Fonts via `next/font/google` (ADR-0007). Each exposes a CSS variable that
 * the Tailwind `fontFamily` tokens (tailwind.config.ts) bind to — no font
 * CSS is hand-written.
 */
const sans = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const serif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  variable: "--font-serif",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Task Tracker · TwoFront",
  description:
    "Real-time operations dashboard — tasks, emails, and Fibonacci SMS.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>): ReactNode {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${serif.variable} ${mono.variable}`}
    >
      {/*
        ADR-0013 rule 1 — the app shell NEVER scrolls. `h-screen
        overflow-hidden` pins the body to the viewport so the resizable
        Splitter layout fills it exactly and panels scroll INTERNALLY
        (no page-level overflow at any nesting depth).
      */}
      <body className="h-screen overflow-hidden">{children}</body>
    </html>
  );
}
