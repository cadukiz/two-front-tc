/**
 * Icon set — pure inline SVG, no runtime deps (ported from the design source,
 * .jsx → .tsx, typed props). `currentColor` so callers tint via Tailwind
 * text-color utilities (ADR-0007).
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

export function ICheck(p: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M3 8.5l3.2 3 6.3-7" />
    </svg>
  );
}

export function IPlus(p: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      {...p}
    >
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function IBolt(p: IconProps) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M9 1L2.5 9.2h4.1L7 15l6.5-8.2H9.4L10 1z" />
    </svg>
  );
}

export function IDigest(p: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      {...p}
    >
      <path d="M3 4.5h10M3 8h10M3 11.5h7" />
    </svg>
  );
}

export function IArrowUp(p: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" />
    </svg>
  );
}

export function IGrip(p: IconProps) {
  return (
    <svg viewBox="0 0 12 16" fill="currentColor" {...p}>
      <circle cx="3" cy="3" r="1.4" />
      <circle cx="9" cy="3" r="1.4" />
      <circle cx="3" cy="8" r="1.4" />
      <circle cx="9" cy="8" r="1.4" />
      <circle cx="3" cy="13" r="1.4" />
      <circle cx="9" cy="13" r="1.4" />
    </svg>
  );
}

export function IHand(p: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M5 9V3.5a1.2 1.2 0 0 1 2.4 0V8M7.4 8V2.7a1.2 1.2 0 0 1 2.4 0V8M9.8 8V4a1.2 1.2 0 0 1 2.4 0v6.5c0 2.5-2 4-4.4 4S3 12.5 3 10.5L2 7.2a1.1 1.1 0 0 1 1.9-1l1.1 1.6" />
    </svg>
  );
}

export function IChevron(p: IconProps) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function IFibonacci(p: IconProps) {
  return (
    <svg
      viewBox="0 0 28 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <path d="M 26 16 A 9 9 0 0 0 17 7 A 5.5 5.5 0 0 0 11.5 12.5 A 3.4 3.4 0 0 0 14.9 15.9 A 2.1 2.1 0 0 0 17 13.8 A 1.3 1.3 0 0 0 15.7 12.5" />
      <path
        opacity="0.18"
        d="M 17 7 L 17 16 M 11.5 7 L 26 7 M 11.5 12.5 L 17 12.5 M 14.9 12.5 L 14.9 15.9"
        strokeWidth="0.8"
      />
    </svg>
  );
}

export function ITomato({
  size = 44,
  ...p
}: IconProps & { size?: number }) {
  return (
    <svg viewBox="0 0 48 52" width={size} height={(size * 52) / 48} {...p}>
      <ellipse cx="24" cy="32" rx="17" ry="15.5" fill="#C24A33" />
      <ellipse
        cx="24"
        cy="32"
        rx="17"
        ry="15.5"
        fill="none"
        stroke="#8E2E1F"
        strokeOpacity="0.5"
        strokeWidth="0.8"
      />
      <path
        d="M 24 18 Q 22 32 24 46"
        stroke="#8E2E1F"
        strokeOpacity="0.25"
        strokeWidth="0.8"
        fill="none"
      />
      <ellipse cx="17" cy="24" rx="5" ry="3" fill="#E07258" opacity="0.55" />
      <path
        d="M 24 18 L 16 11 Q 19 16 21 16 L 14 17 Q 19 19 22 18 L 18 23 Q 23 20 24 18 Z"
        fill="#2E5A3E"
        stroke="#1B3B26"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M 24 18 L 32 11 Q 29 16 27 16 L 34 17 Q 29 19 26 18 L 30 23 Q 25 20 24 18 Z"
        fill="#2E5A3E"
        stroke="#1B3B26"
        strokeWidth="0.6"
        strokeLinejoin="round"
      />
      <path
        d="M 24 18 Q 25 12 23 7"
        stroke="#1B3B26"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function IClock(p: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IChecklist(p: IconProps) {
  return (
    <svg
      viewBox="0 0 22 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <rect x="1.5" y="2.5" width="19" height="15" rx="2" />
      <path d="M5 7.4 l1.6 1.6 L9.6 6" />
      <path d="M12.5 7.4 L18 7.4" />
      <path d="M5 13.4 l1.6 1.6 L9.6 12" />
      <path d="M12.5 13.4 L18 13.4" />
    </svg>
  );
}

export function IEnvelope(p: IconProps) {
  return (
    <svg
      viewBox="0 0 24 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...p}
    >
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M3 5 L12 12 L21 5" />
    </svg>
  );
}
