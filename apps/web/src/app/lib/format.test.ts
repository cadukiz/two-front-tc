import { describe, it, expect } from "vitest";
import { relativeAge, formatTime, formatDateTime } from "./format";

describe("relativeAge", () => {
  const now = 10_000_000;
  it("'just now' under 5s", () => {
    expect(relativeAge(now - 0, now)).toBe("just now");
    expect(relativeAge(now - 4_000, now)).toBe("just now");
  });
  it("seconds 5–59", () => {
    expect(relativeAge(now - 5_000, now)).toBe("5s ago");
    expect(relativeAge(now - 59_000, now)).toBe("59s ago");
  });
  it("minutes", () => {
    expect(relativeAge(now - 60_000, now)).toBe("1m ago");
    expect(relativeAge(now - 59 * 60_000, now)).toBe("59m ago");
  });
  it("hours", () => {
    expect(relativeAge(now - 60 * 60_000, now)).toBe("1h ago");
    expect(relativeAge(now - 23 * 3_600_000, now)).toBe("23h ago");
  });
  it("days", () => {
    expect(relativeAge(now - 24 * 3_600_000, now)).toBe("1d ago");
    expect(relativeAge(now - 3 * 86_400_000, now)).toBe("3d ago");
  });
  it("clamps negative (future) ages to 'just now'", () => {
    expect(relativeAge(now + 5_000, now)).toBe("just now");
  });
});

describe("formatTime", () => {
  it("zero-pads HH:MM:SS in local time", () => {
    const d = new Date(2026, 4, 15, 9, 3, 7);
    expect(formatTime(d.getTime())).toBe("09:03:07");
  });
});

describe("formatDateTime", () => {
  it("prefixes short month + day", () => {
    const d = new Date(2026, 4, 15, 14, 0, 0);
    expect(formatDateTime(d.getTime())).toBe("May 15, 14:00:00");
  });
});
