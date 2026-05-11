import { describe, expect, it } from "vitest";
import {
  formatTimerange,
  parseTimerange,
  secondsToTimerange,
  timerangeDurationSeconds,
} from "../src/timerange.js";

describe("parseTimerange", () => {
  it("parses a standard bounded timerange", () => {
    const parsed = parseTimerange("[0:0_30:0)");
    expect(parsed.start).toEqual({ sec: 0, nsec: 0 });
    expect(parsed.end).toEqual({ sec: 30, nsec: 0 });
    expect(parsed.startInclusive).toBe(true);
    expect(parsed.endInclusive).toBe(false);
  });

  it("parses a timerange with nanoseconds", () => {
    const parsed = parseTimerange("[10:500000000_42:999999999)");
    expect(parsed.start).toEqual({ sec: 10, nsec: 500000000 });
    expect(parsed.end).toEqual({ sec: 42, nsec: 999999999 });
  });

  it("parses open-end timerange", () => {
    const parsed = parseTimerange("[5:0_)");
    expect(parsed.start).toEqual({ sec: 5, nsec: 0 });
    expect(parsed.end).toBeNull();
  });

  it("parses open-start timerange", () => {
    const parsed = parseTimerange("[_60:0)");
    expect(parsed.start).toBeNull();
    expect(parsed.end).toEqual({ sec: 60, nsec: 0 });
  });

  it("parses fully open timerange [_)", () => {
    const parsed = parseTimerange("[_)");
    expect(parsed.start).toBeNull();
    expect(parsed.end).toBeNull();
    expect(parsed.startInclusive).toBe(true);
    expect(parsed.endInclusive).toBe(false);
  });

  it("parses eternity shorthand _", () => {
    const parsed = parseTimerange("_");
    expect(parsed.start).toBeNull();
    expect(parsed.end).toBeNull();
  });

  it("parses inclusive-end bracket]", () => {
    const parsed = parseTimerange("[0:0_30:0]");
    expect(parsed.endInclusive).toBe(true);
  });

  it("parses exclusive-start bracket (", () => {
    const parsed = parseTimerange("(0:0_30:0)");
    expect(parsed.startInclusive).toBe(false);
  });

  it("throws on invalid input", () => {
    expect(() => parseTimerange("not-a-timerange")).toThrow("Invalid TAMS timerange");
    expect(() => parseTimerange("")).toThrow();
    expect(() => parseTimerange("[0_30)")).toThrow();
  });
});

describe("formatTimerange", () => {
  it("round-trips a bounded timerange", () => {
    const raw = "[10:0_60:0)";
    expect(formatTimerange(parseTimerange(raw))).toBe(raw);
  });

  it("round-trips an open-end timerange", () => {
    const raw = "[5:0_)";
    expect(formatTimerange(parseTimerange(raw))).toBe(raw);
  });

  it("round-trips a fully open timerange", () => {
    const raw = "[_)";
    expect(formatTimerange(parseTimerange(raw))).toBe(raw);
  });

  it("formats with nanoseconds", () => {
    const raw = "[0:500000000_30:0)";
    expect(formatTimerange(parseTimerange(raw))).toBe(raw);
  });
});

describe("timerangeDurationSeconds", () => {
  it("computes duration for a simple timerange", () => {
    expect(timerangeDurationSeconds("[0:0_30:0)")).toBe(30);
  });

  it("computes duration with nanoseconds", () => {
    expect(timerangeDurationSeconds("[0:0_10:500000000)")).toBeCloseTo(10.5);
  });

  it("returns Infinity for open-end timerange", () => {
    expect(timerangeDurationSeconds("[0:0_)")).toBe(Infinity);
  });

  it("returns Infinity for fully open timerange", () => {
    expect(timerangeDurationSeconds("[_)")).toBe(Infinity);
  });

  it("returns 0 for a zero-duration timerange", () => {
    expect(timerangeDurationSeconds("[5:0_5:0)")).toBe(0);
  });
});

describe("secondsToTimerange", () => {
  it("converts whole seconds", () => {
    expect(secondsToTimerange(30)).toBe("[0:0_30:0)");
  });

  it("converts fractional seconds", () => {
    expect(secondsToTimerange(10.5)).toBe("[0:0_10:500000000)");
  });

  it("converts zero", () => {
    expect(secondsToTimerange(0)).toBe("[0:0_0:0)");
  });
});
