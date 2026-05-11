import { timerangeDurationSeconds, type Flow, type FlowSegment } from "@tooscut/tams-client";

import type { MediaAsset as StoreMediaAsset } from "../../../state/video-editor-store";
import type { TamsMediaAsset } from "../../timeline/use-asset-store";

/** Matches the FrameRate type from @tooscut/render-engine */
interface FrameRate {
  numerator: number;
  denominator: number;
}

/**
 * Convert a TAMS flow + its first segment into the two MediaAsset shapes:
 * - `ui`: for useAssetStore (duration in seconds, has source/tams fields)
 * - `store`: for useVideoEditorStore (duration in frames, persisted to IndexedDB)
 *
 * Phase 4 uses the first available segment's presigned GET URL as the clip URL.
 * Phase 5 will refresh this URL before it expires.
 */
export function flowToMediaAsset(
  flow: Flow,
  segment: FlowSegment | null,
  projectFps: FrameRate,
): { ui: TamsMediaAsset; store: StoreMediaAsset } {
  const id = crypto.randomUUID();
  const type = flow.format.includes(":audio") ? ("audio" as const) : ("video" as const);
  const durationSec = segment ? timerangeDurationSeconds(segment.timerange) : 0;
  const segmentTimerange = segment?.timerange ?? "[_)";
  const url = segment?.get_urls?.[0]?.url ?? "";
  const label = flow.label ?? flow.id;

  const ui: TamsMediaAsset = {
    id,
    source: "tams",
    type,
    name: label,
    url,
    duration: durationSec,
    width: flow.essence_parameters?.frame_width,
    height: flow.essence_parameters?.frame_height,
    tamsSourceId: flow.source_id,
    tamsFlowId: flow.id,
    segmentTimerange,
  };

  const store: StoreMediaAsset = {
    id,
    type,
    name: label,
    url,
    duration: Math.round((durationSec * projectFps.numerator) / projectFps.denominator),
    width: flow.essence_parameters?.frame_width,
    height: flow.essence_parameters?.frame_height,
    tamsSourceId: flow.source_id,
    tamsFlowId: flow.id,
    segmentTimerange,
  };

  return { ui, store };
}
