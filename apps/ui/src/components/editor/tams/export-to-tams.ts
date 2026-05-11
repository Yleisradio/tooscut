import { secondsToTimerange, type TamsClient } from "@tooscut/tams-client";

import type { FrameRate } from "@tooscut/render-engine";

// The yletams API has no PUT /sources/:id endpoint — sources are auto-created
// by PUT /flows/:id when the source_id doesn't exist yet. The label is then set
// separately via PUT /sources/:sourceId/label.
export type TamsExportStep =
  | "creating_flow"
  | "labelling_source"
  | "allocating"
  | "uploading"
  | "registering";

export interface TamsExportInput {
  sourceLabel: string;
  flowLabel: string;
  buffer: ArrayBuffer;
  durationSeconds: number;
  settings: {
    width: number;
    height: number;
    fps: FrameRate;
  };
}

export interface TamsExportResult {
  sourceId: string;
  flowId: string;
}

export async function exportToTams(
  client: TamsClient,
  input: TamsExportInput,
  onStep: (step: TamsExportStep) => void,
): Promise<TamsExportResult> {
  // Generate the source ID here so we can reference it before the source row exists.
  // PUT /flows/:id auto-creates the source when source_id is not found.
  const sourceId = crypto.randomUUID();

  onStep("creating_flow");
  const flow = await client.flows.create({
    source_id: sourceId,
    format: "urn:x-nmos:format:video",
    codec: "video/avc",
    container: "video/mp4",
    label: input.flowLabel,
    essence_parameters: {
      frame_width: input.settings.width,
      frame_height: input.settings.height,
      frame_rate: input.settings.fps,
    },
  });

  // Set the source label now that the source row exists.
  onStep("labelling_source");
  await client.sources.setLabel(sourceId, input.sourceLabel);

  onStep("allocating");
  const allocations = await client.flows.allocateStorage(flow.id, 1);
  const allocation = allocations[0];
  if (!allocation) throw new Error("No storage allocation received from TAMS");

  onStep("uploading");
  const uploadResponse = await fetch(allocation.put_url, {
    method: "PUT",
    body: input.buffer,
    headers: { "Content-Type": "video/mp4" },
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`);
  }

  onStep("registering");
  await client.flows.registerSegment(flow.id, {
    object_id: allocation.object_id,
    timerange: secondsToTimerange(input.durationSeconds),
  });

  return { sourceId, flowId: flow.id };
}
