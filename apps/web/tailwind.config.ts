import type { Config } from "tailwindcss";

/**
 * ADR-0007 — Tailwind-only. The Claude-Design `globals.css` token layer
 * (colors / fonts / radii / shadows / keyframes) is *translated* here into
 * `theme.extend`; it is NOT imported as CSS. Component styling is expressed
 * exclusively with Tailwind utilities + arbitrary values against these tokens.
 * Font families bind to the `next/font` CSS variables set in `layout.tsx`.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces — warm cream / paper (from mytwofront.com)
        app: "#F3ECD6",
        panel: "#FBF6E5",
        card: "#FFFCF1",
        "card-alt": "#F8F2DF",
        sage: "#C2CCB9",
        "sage-soft": "#D4DCCB",
        // Wooden-tan clipboard board
        clipboard: "#DCC68F",
        clip: "#2A1F0F",
        // Ink
        "ink-1": "#1B2620",
        "ink-2": "#4A5852",
        "ink-3": "#8A968F",
        "ink-4": "#B5BEB8",
        // Two Front deep teal accent
        "teal-900": "#084736",
        teal: "#0E5C47",
        "teal-300": "#4E8C7A",
        "teal-50": "#DDEAE3",
        // Warm neutrals + rust
        tan: "#E5D9B9",
        "tan-deep": "#C9BB95",
        rust: "#B05236",
        // Reconnect (amber) accents
        warn: "#8a6a1a",
        "warn-dot": "#C99A2E",
        "warn-bg": "#FBF1D6",
      },
      borderColor: {
        line: "rgba(15, 93, 74, 0.14)",
        "line-soft": "rgba(15, 93, 74, 0.07)",
      },
      fontFamily: {
        // Bound to the next/font variables exposed in layout.tsx.
        sans: [
          "var(--font-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        serif: ["var(--font-serif)", "EB Garamond", "Georgia", "serif"],
        mono: [
          "var(--font-mono)",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      borderRadius: {
        panel: "22px",
        card: "14px",
        row: "10px",
        pill: "999px",
      },
      boxShadow: {
        sm: "0 1px 0 rgba(15, 93, 74, 0.04), 0 1px 2px rgba(15, 93, 74, 0.05)",
        md: "0 1px 0 rgba(15, 93, 74, 0.04), 0 4px 12px -2px rgba(15, 93, 74, 0.08)",
        lg: "0 4px 20px -4px rgba(15, 93, 74, 0.14)",
        clipboard:
          "0 1px 0 rgba(255,255,255,0.28) inset, 0 4px 14px -4px rgba(60, 40, 20, 0.16)",
      },
      keyframes: {
        // Connection pill — live pulse / reconnect blink
        pulse: {
          "0%": { boxShadow: "0 0 0 0 rgba(15, 93, 74, 0.45)" },
          "70%": { boxShadow: "0 0 0 6px rgba(15, 93, 74, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(15, 93, 74, 0)" },
        },
        blink: { "50%": { opacity: "0.4" } },
        // Arrivals & freshness highlight
        enterTop: {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        enterBubble: {
          from: { opacity: "0", transform: "translateY(8px) scale(.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        highlight: {
          "0%": {
            backgroundColor: "#DDEAE3",
            borderColor: "rgba(15,93,74,0.3)",
          },
          "100%": {
            backgroundColor: "#FFFCF1",
            borderColor: "rgba(15, 93, 74, 0.07)",
          },
        },
        chipIn: {
          from: { transform: "translate(-50%, -8px)", opacity: "0" },
          to: { transform: "translate(-50%, 0)", opacity: "1" },
        },
      },
      animation: {
        pulse: "pulse 2.4s ease-out infinite",
        blink: "blink 1.2s ease-in-out infinite",
        "enter-top": "enterTop 320ms cubic-bezier(.2,.7,.2,1)",
        "enter-bubble": "enterBubble 360ms cubic-bezier(.2,.7,.2,1)",
        // Freshness / arrival highlight (enter + fade the teal wash out)
        fresh:
          "enterTop 280ms cubic-bezier(.2,.7,.2,1), highlight 1400ms ease-out 280ms",
        "fresh-bubble":
          "enterBubble 360ms cubic-bezier(.2,.7,.2,1), highlight 1600ms ease-out 360ms",
        "chip-in": "chipIn 280ms cubic-bezier(.2,.7,.2,1)",
      },
      fontSize: {
        // Design's base body size
        base: ["14.5px", { lineHeight: "1.45", letterSpacing: "-0.005em" }],
      },
    },
  },
  plugins: [],
};

export default config;
