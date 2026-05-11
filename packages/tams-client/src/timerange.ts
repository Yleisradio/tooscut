import type { ParsedTimerange } from "./types.js";

function parseTimestamp(s: string): { sec: number; nsec: number } | null {
  if (s === "") return null;
  const colon = s.indexOf(":");
  if (colon === -1) throw new Error(`Invalid TAMS timestamp (expected sec:nsec): "${s}"`);
  return { sec: Number(s.slice(0, colon)), nsec: Number(s.slice(colon + 1)) };
}

export function parseTimerange(raw: string): ParsedTimerange {
  if (raw === "_") {
    return { start: null, end: null, startInclusive: true, endInclusive: false };
  }

  const openBracket = raw[0];
  const closeBracket = raw[raw.length - 1];

  if (
    (openBracket !== "[" && openBracket !== "(") ||
    (closeBracket !== "]" && closeBracket !== ")")
  ) {
    throw new Error(`Invalid TAMS timerange: "${raw}"`);
  }

  // Strip outer brackets, then split on first _ (the start/end separator)
  const inner = raw.slice(1, -1);
  const sep = inner.indexOf("_");
  if (sep === -1) throw new Error(`Invalid TAMS timerange: "${raw}"`);

  const start = parseTimestamp(inner.slice(0, sep));
  const end = parseTimestamp(inner.slice(sep + 1));

  return {
    start,
    end,
    startInclusive: openBracket === "[",
    endInclusive: closeBracket === "]",
  };
}

export function formatTimerange(parsed: ParsedTimerange): string {
  const open = parsed.startInclusive ? "[" : "(";
  const close = parsed.endInclusive ? "]" : ")";
  const start = parsed.start ? `${parsed.start.sec}:${parsed.start.nsec}` : "";
  const end = parsed.end ? `${parsed.end.sec}:${parsed.end.nsec}` : "";
  return `${open}${start}_${end}${close}`;
}

export function timerangeDurationSeconds(raw: string): number {
  const { start, end } = parseTimerange(raw);
  if (!start || !end) return Infinity;
  const startSec = start.sec + start.nsec / 1_000_000_000;
  const endSec = end.sec + end.nsec / 1_000_000_000;
  return Math.max(0, endSec - startSec);
}

export function secondsToTimerange(durationSeconds: number): string {
  const sec = Math.floor(durationSeconds);
  const nsec = Math.round((durationSeconds - sec) * 1_000_000_000);
  return `[0:0_${sec}:${nsec})`;
}
