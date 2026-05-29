import { parseTimerange, type Flow, type FlowSegment } from "@tooscut/tams-client";

import type { MediaAsset as StoreMediaAsset } from "../../../state/video-editor-store";
import type { TamsMediaAsset } from "../../timeline/use-asset-store";

interface FrameRate {
  numerator: number;
  denominator: number;
}

const INIT_SEGMENT_TIMERANGE = "[0:0_0:1)";

interface ParsedTimerange {
  start: number;
  end: number;
}

function parseFlowSegmentTimerange(seg: FlowSegment): ParsedTimerange | null {
  try {
    const parsed = parseTimerange(seg.timerange);
    if (!parsed.start || !parsed.end) return null;
    return {
      start: parsed.start.sec + parsed.start.nsec / 1e9,
      end: parsed.end.sec + parsed.end.nsec / 1e9,
    };
  } catch {
    return null;
  }
}

function formatTimerangeSeconds(startSec: number, endSec: number): string {
  const sFloor = Math.floor(startSec);
  const sNano = Math.round((startSec - sFloor) * 1e9);
  const eFloor = Math.floor(endSec);
  const eNano = Math.round((endSec - eFloor) * 1e9);
  return `[${sFloor}:${sNano}_${eFloor}:${eNano})`;
}

/** TAMS-time start (in seconds) of the first media segment in the playlist. */
export function mediaSourceOriginSec(segments: FlowSegment[]): number | null {
  for (const seg of segments) {
    if (seg.timerange === INIT_SEGMENT_TIMERANGE) continue;
    const parsed = parseFlowSegmentTimerange(seg);
    if (parsed) return parsed.start;
  }
  return null;
}

interface OverlappingSegment {
  seg: FlowSegment;
  parsed: ParsedTimerange;
}

function findOverlappingSegments(
  segments: FlowSegment[],
  flowInSec: number,
  flowOutSec: number,
): OverlappingSegment[] {
  const result: OverlappingSegment[] = [];
  for (const seg of segments) {
    if (seg.timerange === INIT_SEGMENT_TIMERANGE) continue;
    const parsed = parseFlowSegmentTimerange(seg);
    if (!parsed) continue;
    if (parsed.start < flowOutSec && parsed.end > flowInSec) {
      result.push({ seg, parsed });
    }
  }
  return result;
}

/**
 * Build a captured live clip as a standalone playable MP4.
 *
 * fMP4 segments are not individually playable — init.mp4 holds ftyp+moov, each
 * .m4s holds only moof+mdat. Concatenating init + overlapping media segments
 * yields a valid fragmented MP4 the rest of the editor (audio engine, waveform
 * extractor, thumbnail, render engine) can consume without special handling.
 *
 * The clip duration covers the FULL segments that overlap the marked range
 * (so it can be slightly longer than out - in); precise frame-accurate trim
 * is the user's job on the timeline (or future L3 work).
 *
 * Returns null when:
 *  - marks are inverted/equal,
 *  - the init segment hasn't been registered yet,
 *  - no media segment overlaps the marked range,
 *  - any fetch fails.
 */
export async function buildLiveClip(
  flow: Flow,
  segments: FlowSegment[],
  mediaInSec: number,
  mediaOutSec: number,
  projectFps: FrameRate,
): Promise<{ ui: TamsMediaAsset; store: StoreMediaAsset } | null> {
  if (mediaOutSec <= mediaInSec) return null;

  const initSeg = segments.find((s) => s.timerange === INIT_SEGMENT_TIMERANGE);
  const initUrl = initSeg?.get_urls?.[0]?.url;
  if (!initUrl) return null;

  const originSec = mediaSourceOriginSec(segments);
  if (originSec === null) return null;

  const flowInSec = mediaInSec + originSec;
  const flowOutSec = mediaOutSec + originSec;

  const overlapping = findOverlappingSegments(segments, flowInSec, flowOutSec);
  if (overlapping.length === 0) return null;

  const segmentUrls = overlapping
    .map((o) => o.seg.get_urls?.[0]?.url)
    .filter((u): u is string => !!u);
  if (segmentUrls.length === 0) return null;

  let buffers: ArrayBuffer[];
  try {
    buffers = await Promise.all(
      [initUrl, ...segmentUrls].map(async (u) => {
        const resp = await fetch(u);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.arrayBuffer();
      }),
    );
  } catch {
    return null;
  }

  const blob = new Blob(buffers, { type: "video/mp4" });
  const blobUrl = URL.createObjectURL(blob);

  // Duration spans the full content of the blob — not just the marked range —
  // because the timeline plays from the blob's t=0, which is the start of the
  // first overlapping segment, not the user's in-mark.
  const blobStartSec = overlapping[0]!.parsed.start;
  const blobEndSec = overlapping[overlapping.length - 1]!.parsed.end;
  const durationSec = blobEndSec - blobStartSec;

  const tamsTimerange = formatTimerangeSeconds(flowInSec, flowOutSec);
  const id = crypto.randomUUID();
  const type = flow.format.includes(":audio") ? ("audio" as const) : ("video" as const);
  const wallClock = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const name = `Live clip ${wallClock}`;

  const ui: TamsMediaAsset = {
    id,
    source: "tams",
    type,
    name,
    url: blobUrl,
    duration: durationSec,
    width: flow.essence_parameters?.frame_width,
    height: flow.essence_parameters?.frame_height,
    tamsSourceId: flow.source_id,
    tamsFlowId: flow.id,
    segmentTimerange: tamsTimerange,
  };

  const store: StoreMediaAsset = {
    id,
    type,
    name,
    url: blobUrl,
    duration: Math.round((durationSec * projectFps.numerator) / projectFps.denominator),
    width: flow.essence_parameters?.frame_width,
    height: flow.essence_parameters?.frame_height,
    tamsSourceId: flow.source_id,
    tamsFlowId: flow.id,
    segmentTimerange: tamsTimerange,
  };

  return { ui, store };
}
