# Live Cutting from TAMS Live Streams

Watch a live TAMS ingest feed in the existing preview panel, mark in/out points while
watching, and capture each marked range as an asset in the asset bin. The preview keeps
playing. Assets can later be dragged to the timeline and exported to TAMS like any other
clip.

---

## User Story

> As a video editor monitoring a live broadcast, I want to watch the incoming feed in the
> preview panel, quickly mark interesting moments as I see them, and collect those clips
> in the asset bin — without interrupting playback — so I can build a rough cut from live
> material without leaving the editor.

---

## Simplified Design Principles

- **Reuse everything**: preview panel, timeline, asset bin, export-to-TAMS — no new panels.
- **One new interaction**: Mark In + Mark Out on a live preview → asset created in asset bin.
- **Non-destructive**: marking never interrupts playback; the live feed keeps running.
- **Explicit live flag**: flows tagged `"live": "true"` are live; no timestamp inference.

---

## Live Flag in TAMS

The `hls-ingest.sh` script marks every ingested flow as live via the `tags` field:

```json
"tags": { "live": "true" }
```

The UI reads `flow.tags?.live === "true"` to determine liveness. This is reliable and
explicit — no timestamp heuristics. When ingest stops, the operator (or a future cleanup
script) removes the tag or sets it to `"false"`.

---

## UI Changes

### TAMS Panel — Flow Card

`TamsFlowCard` gains a **LIVE** badge when `flow.tags?.live === "true"`.

Clicking a live flow card **loads it into the preview panel in live mode**, the same way
clicking a normal asset opens it in the preview. No extra "Watch Live" button needed —
the badge itself signals the behavior.

```
┌────────────────────────────┐
│ ● LIVE  HLS Ingest (src)   │
│ video/h264 · mp2t          │
│ [thumbnail or live icon]   │
└────────────────────────────┘
```

---

### Preview Panel — Live Mode

When a live flow is loaded into the preview, the panel enters **live mode**:

- **Video element** plays the live feed via MSE (Media Source Extensions), fed by a
  segment poller (see below).
- **"LIVE ●" indicator** in the top-right corner of the preview frame.
- **"Jump to live"** button appears if the user has scrubbed back in the buffer.
- **Mark In / Mark Out** buttons appear in the preview toolbar (same row as play/pause).
- The existing playback controls remain — pause, scrub within the buffer window.

```
┌─────────────────────────────────────────────┐
│                                      LIVE ● │
│                                             │
│          <video — live MSE feed>            │
│                                             │
└─────────────────────────────────────────────┘
  [◀◀]  [▶]  [▶▶]  |  [Mark In]  [Mark Out]  [Clip ✂]
                         00:01:23   00:01:47
```

Marked in/out times are shown next to the buttons. **Clip ✂** is enabled only when both
marks are set. Pressing it creates the asset and clears the marks — preview keeps playing.

---

### Asset Bin — Live Clips

Each captured clip appears in the asset bin with:

- Thumbnail: a still frame from the in-point (best-effort; icon fallback).
- Duration badge: `out - in` seconds.
- Label: `"Live clip HH:MM:SS"` (wall-clock time of capture).

From there the user drags it to the timeline, edits it, and exports to TAMS exactly as
any other TAMS asset.

---

## Technical Details

### Segment Poller

`useLiveSegmentPoller(flowId, tamsClient)`:

```ts
type LiveSegment = {
  segment: FlowSegment;
  blobUrl: string;   // fetched TS blob, object URL for MSE append
};
```

- Polls `GET /flows/{id}/segments?timerange_start={lastKnownEnd}` every 2 s.
- Fetches each new segment's TS binary via the presigned `get_urls[0].url`.
- Returns the running list of `LiveSegment[]` and `latestEndSec`.
- Runs only while the live preview is open; stops (and revokes blob URLs) on unmount.

### MSE Player

`useMsePlayer(videoRef, segments)`:

- Maintains a single `MediaSource` + `SourceBuffer` (codec: `video/mp2t; codecs="avc1.42E01E"`).
- Appends new blobs as they arrive from the poller.
- Evicts segments older than the **buffer window** (default 10 min) to cap memory.
- Exposes `bufferedStartSec` and `bufferedEndSec` for the scrub indicator.
- **Fallback**: if `MediaSource.isTypeSupported('video/mp2t')` returns false (Firefox,
  older Safari), fall back to playing each segment sequentially as a `src` blob URL.

### Mark State

Local state in the preview panel component:

```ts
type LiveMarks = {
  inSec: number | null;
  outSec: number | null;
};
```

`inSec`/`outSec` are flow-relative seconds: `bufferedStartSec + video.currentTime`.

Keyboard shortcuts (active only when a live flow is loaded in preview):

- `I` — Mark In
- `O` — Mark Out
- `X` — Clear marks
- `Enter` / `C` — Clip (create asset, clear marks)

### Clip Creation

`buildLiveClip(flow, inSec, outSec)` → `TamsMediaAsset`:

```ts
{
  source: "tams",
  id: crypto.randomUUID(),
  name: `Live clip ${formatWallClock()}`,
  tamsSourceId: flow.source_id,
  tamsFlowId: flow.id,
  segmentTimerange: `[${inSec}:0_${outSec}:0)`,
  duration: outSec - inSec,          // seconds
  url: freshPresignedUrlForRange,    // via tamsUrlCache
  urlExpiresAt: now + 3600_000,
}
```

The asset is added via `addAsset()` (same call as dragging a flow card to the bin).
The preview **is not touched** — `currentTime`, playback state, and the poller continue
unchanged.

---

## Data Flow

```
hls-ingest.sh  →  TAMS API  →  S3
                      ↑
           useLiveSegmentPoller (every 2 s)
                      ↓
             segments[] + blob URLs
                      ↓
             useMsePlayer → <video> in Preview Panel
                      ↓ (user presses I / O / C)
             buildLiveClip → TamsMediaAsset
                      ↓
             Asset Bin  →  (drag to Timeline)  →  Export to TAMS
```

---

## New Files

```
apps/ui/src/components/editor/
  tams/
    use-live-segment-poller.ts   Poll TAMS for new segments; fetch TS blobs
    use-mse-player.ts            MSE SourceBuffer lifecycle
    build-live-clip.ts           Pure: (flow, inSec, outSec) → TamsMediaAsset
  live-mark-controls.tsx         Mark In / Mark Out / Clip buttons + keyboard bindings
```

---

## Modified Files

| File | Change |
|---|---|
| `tams-flow-card.tsx` | LIVE badge when `flow.tags?.live === "true"`; click loads preview in live mode |
| `tams-panel.tsx` | Pass `onLoadLivePreview` callback to flow cards |
| `preview-panel.tsx` | Detect live TAMS asset; render `<LiveMarkControls>`; mount poller + MSE player |

---

## Implementation Phases

Each phase is a vertical slice: end-to-end working software you can run, use, and give
feedback on. Nothing is left half-finished at the end of a phase.

---

### Phase L1 — Identify and watch a live flow

Everything needed to discover that a flow is live and start watching it.

**Delivers:**

- LIVE badge (pulsing dot + "LIVE" text) on `TamsFlowCard` when `flow.tags?.live === "true"`.
- Clicking the card loads the flow into the preview panel, same as any other flow card.
- Preview panel detects a live TAMS flow and mounts the MSE player:
  - `use-live-segment-poller.ts` — polls `GET /flows/{id}/segments?timerange_start=…`
    every 2 s; fetches each new TS blob.
  - `use-mse-player.ts` — appends blobs to a `SourceBuffer`; evicts old segments to cap
    memory; `video.currentTime` follows the live edge.
- "LIVE ●" indicator in the top-right of the preview frame.
- Graceful fallback message ("Live preview not supported in this browser") if
  `MediaSource.isTypeSupported('video/mp2t')` returns false (Firefox / older Safari).

**You can give feedback on:**

- Does the LIVE badge appear on the right flow cards?
- Does clicking the card start the live feed in the preview?
- How much latency is there from ingest to preview?
- Any codec or CORS errors in the console?

---

### Phase L2 — Mark a moment and capture it as an asset

Everything needed to grab a clip from the live feed without stopping playback.

**Delivers:**

- Mark In (`I`) and Mark Out (`O`) keyboard shortcuts active while a live flow is in
  the preview; timestamps shown next to the buttons in the preview toolbar.
- Clip button (`C` / `Enter`) — enabled only when both marks are set:
  - Calls `buildLiveClip(flow, inSec, outSec)` → `TamsMediaAsset` with the correct
    `segmentTimerange`, `duration`, and a fresh presigned URL via `tamsUrlCache`.
  - Adds the asset to the asset bin (`addAsset()`).
  - Clears the marks.
  - **Preview continues playing uninterrupted.**
- Asset appears in the bin with label `"Live clip HH:MM:SS"` and duration badge.
- `X` clears marks without creating a clip.

**You can give feedback on:**

- Does `I` / `O` / `C` feel natural while watching?
- Is the asset duration accurate?
- Does the preview keep playing after clipping?
- Can you capture multiple clips back-to-back without reopening anything?

---

### Phase L3 — Use the clip: timeline and export

Everything needed to go from a captured asset to a finished, exported clip. This phase
has no new live-cutting code — it verifies that the captured asset works correctly
through the existing pipeline.

**Delivers:**

- Drag the captured asset from the bin onto the timeline — it lands as a standard clip
  with correct in/out, trim handles, and linked audio track.
- Clip plays back in the preview at the correct segment (the marked timerange, not the
  full flow).
- Export the clip to TAMS via the existing "Export to TAMS" dialog — the exported
  segment covers exactly the marked range.

**You can give feedback on:**

- Does the clip play the right portion of the stream (correct in/out)?
- Does export produce a valid TAMS segment that re-imports cleanly?
- Any issues mixing a live-captured clip with other clips on the timeline?

---

## Key Risks

| Risk | Mitigation |
|---|---|
| `video/mp2t` not supported in MSE (Firefox, Safari) | Detect at init; fall back to sequential `src` blob playback |
| S3 CORS blocks TS blob fetch | LocalStack: permissive CORS by default. Production: add `AllowedOrigins` to S3 bucket |
| Mark timestamps drift from flow time | Always compute `bufferedStartSec + video.currentTime` at mark time, not at monitor open |
| Memory growth for long sessions | Evict segments outside buffer window in MSE; revoke blob URLs on evict |

---

## Success Criteria

- [ ] L1: LIVE badge on cards with `tags.live === "true"`; no badge on non-live flows
- [ ] L2: Live video plays in the preview panel; "LIVE ●" indicator visible; scrubbing within buffer works
- [ ] L3: Mark In + Mark Out + Clip creates an asset in the bin with correct in/out duration; preview is uninterrupted; asset plays correctly on the timeline
