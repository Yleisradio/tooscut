# TAMS Integration

Integrate the BBC TAMS v8.0 API (yletams) as a remote media source/sink in tooscut. Users browse and search TAMS sources and flows in a dedicated panel, drag flows onto the timeline where they work as normal clips, and export edited timelines back to TAMS as new Source + Flow entities.

## Requirements

1. **Browse & search TAMS sources/flows** — new "TAMS" tab in AssetPanel; searchable source list; expand a source to see its flows
2. **Drag flows to timeline** — a TAMS flow added to the timeline behaves identically to a local clip (trim, split, cut)
3. **Multiple sources/flows on one timeline** — mix TAMS flows and local files freely
4. **Export to TAMS** — create a new Source + Flow, upload rendered media via presigned PUT, register segments
5. **Session authentication** — username/password dialog; credentials held in memory only (gone on page refresh)

## Architecture

### Authentication

Basic auth (`Authorization: Basic btoa(user:pass)`) on every request. Credentials are stored in a non-persisted Zustand store (`useTamsAuthStore`) — session-scoped, never written to IndexedDB or localStorage.

**Login flow:**
1. User opens the TAMS tab → if no credentials in memory, `<TamsLoginDialog>` appears
2. On submit, a test call (`sources.list({ limit: 1 })`) validates the credentials
3. On 401 during a session, the dialog re-appears automatically
4. API URL (`VITE_TAMS_API_URL`) is the only env var; it can also be changed via a small settings input

### `MediaAsset` — discriminated union

The current `MediaAsset` type requires a `File` object. TAMS assets have no local file, so the type is extended to a discriminated union:

```ts
type LocalMediaAsset = MediaAssetBase & {
  source: "local"
  file: File
}

type TamsMediaAsset = MediaAssetBase & {
  source: "tams"
  tamsSourceId: string
  tamsFlowId: string
  segmentTimerange: Timerange
  urlExpiresAt: number   // epoch ms
}

type MediaAsset = LocalMediaAsset | TamsMediaAsset
```

All existing `asset.file` call sites are gated behind `source === "local"`. Existing persisted assets default to `source: "local"` via a Dexie migration.

### Multi-segment MVP

TAMS flows can have many segments. For the initial version: use the **first segment's presigned GET URL** as the asset URL; duration is derived from the segment's timerange string `[sec:nsec_sec:nsec)`. Full multi-segment stitching is out of scope for now.

### Presigned URL refresh

Presigned S3 GET URLs expire (default ~1 hour). A `tamsUrlCache` singleton tracks expiry per asset and proactively re-fetches segments within 5 minutes of expiry. A root-level hook sweeps all timeline-referenced TAMS assets every 60 seconds.

### New package: `@tooscut/tams-client`

A standalone, framework-agnostic typed client for the TAMS API. Lives in `packages/tams-client` so it can be unit-tested in isolation without React.

## New Files

```
packages/tams-client/
  src/
    schemas.ts          Zod schemas: Source, Flow, FlowSegment, Timerange, StorageAllocation
    types.ts            TS types inferred from Zod schemas; TamsClientConfig
    timerange.ts        Parse/format TAMS timerange strings; convert to seconds/frames
    errors.ts           TamsError class (codes: AUTH, NOT_FOUND, NETWORK, VALIDATION, EXPIRED_URL)
    http.ts             fetch wrapper: injects Basic auth, Zod-validates, throws TamsError
    sources-repo.ts     SourcesRepository: list, findById, create
    flows-repo.ts       FlowsRepository: listForSource, findById, create, getSegments,
                        allocateStorage, registerSegment
    client.ts           createTamsClient(config) factory — public entry point
    __tests__/          Unit tests + JSON fixtures from yletams

apps/ui/src/
  state/
    settings-store.ts           Zustand: tamsApiUrl (persisted), editable in UI
    tams-auth-store.ts          Zustand: username/password (memory only, no persistence)
    use-tams-client.ts          Hook: memoized TamsClient bound to current auth + URL

  components/editor/
    tams/
      tams-panel.tsx            TAMS tab: search input + paginated source list
      tams-source-row.tsx       Source row with expand toggle
      tams-flow-card.tsx        Draggable flow card (mirrors AssetCard look/feel)
      tams-login-dialog.tsx     Username/password form; shows on missing or expired credentials
      tams-to-asset.ts          flowToMediaAsset(flow, segments) → TamsMediaAsset
      tams-thumbnail.ts         Best-effort thumbnail via hidden <video> seek; icon fallback
      tams-url-cache.ts         Singleton: getFreshUrl(assetId), expiry tracking, refresh
      use-tams-url-refresh.ts   Root hook: 60s sweep of near-expiry assets
      use-tams-sources.ts       Hook: paginated/searched sources with debounced query
      use-tams-flows.ts         Hook: flows for an expanded source (lazy, cached)
      export-to-tams.ts         Orchestrator: render blob → Source → Flow → PUT → Segment
      export-to-tams-dialog.tsx Progress dialog; success state with link to new source
      __tests__/                RTL + unit tests for all of the above
```

## Modified Files

| File | Change |
|---|---|
| `apps/ui/src/components/timeline/use-asset-store.ts` | `MediaAsset` → discriminated union; TAMS variant skips `URL.revokeObjectURL`; `hydrateAssets` branches on `source`; `addAssetsToStores` persists TAMS metadata to `tamsAssets` Dexie table |
| `apps/ui/src/state/video-editor-store.ts` | Mirror discriminated union on persisted asset type; Dexie migration defaults existing rows to `source: "local"` |
| `apps/ui/src/state/db.ts` | Add `tamsAssets` table (`id, sourceId, flowId, segmentTimerange, label, format, storedAt`); bump Dexie version |
| `apps/ui/src/components/editor/asset-panel.tsx` | Add "TAMS" to `PANEL_TABS`; render `<TamsPanel />`; add settings gear button |
| `apps/ui/src/components/editor/export-dialog.tsx` | Add "Export to TAMS" option alongside existing export actions |
| `tooscut/.env.example` | Document `VITE_TAMS_API_URL` |
| `tooscut/pnpm-workspace.yaml` | Confirm `packages/*` covers `tams-client` (likely already does) |
| `apps/ui/package.json` | Add `@tooscut/tams-client: workspace:*` and `zod` (if not already present) |

## Implementation Phases

### Phase 1 — `@tooscut/tams-client` (no UI)

Scaffold the `packages/tams-client` workspace package with Zod schemas, typed repository classes, timerange parser, HTTP wrapper, and public factory. No React dependency.

Deliverable: a fully unit-tested, typed TAMS API client. >80% coverage. Fixture tests validate schemas against real yletams responses.

### Phase 2 — Settings + Authentication

- `useSettingsStore`: persists `tamsApiUrl` to Dexie; hydrates from `VITE_TAMS_API_URL` on first run
- `useTamsAuthStore`: memory-only Zustand store for `username` / `password`; `login()` validates via API
- `<TamsLoginDialog>`: form that appears when TAMS tab is opened without credentials or on 401
- `useTamsClient` hook: memoized client instance bound to current URL + credentials
- Add `tamsAssets` and `settings` Dexie tables

### Phase 3 — TAMS browser UI

- `<TamsPanel>`: debounced search input + paginated source list
- `<TamsSourceRow>`: expand/collapse to show flows
- `<TamsFlowCard>`: draggable, prefetches segments on source expand (not on drag start)
- Wire "TAMS" tab into `AssetPanel`

### Phase 4 — Drag a TAMS flow to the timeline (clip appears, no playback yet)

Thinnest end-to-end slice: a TAMS flow lands on the timeline as a real clip with correct name and duration. Video will not play yet — the URL field is left as the raw presigned URL and may be expired or blocked by CORS. Everything else (timeline snapping, trim handles, linked audio track) works because the clip shape is identical to a local asset.

- Discriminated union refactor of `MediaAsset` — `source: "local" | "tams"` discriminator; all existing `asset.file` call sites gated; Dexie migration defaults persisted assets to `source: "local"` (single focused commit + typecheck pass before any new behaviour is layered on)
- `flowToMediaAsset(flow, firstSegment)` converter → `TamsMediaAsset` with `id`, `name`, `duration` (from timerange), `url` (first presigned GET URL), `tamsSourceId`, `tamsFlowId`, `segmentTimerange`
- Drag handler in `TamsFlowCard` uses the converter and pushes the result to both stores via the same `DataTransfer` keys as local assets — existing timeline drop handlers require no changes
- Dexie `tamsAssets` table added (bumps DB version); persists `TamsMediaAsset` metadata so the panel state survives a page reload even if the URL is stale

**Feedback target:** Does the clip appear on the timeline? Is the duration correct? Does trim/split behave identically to local clips?

### Phase 5 — TAMS clip plays + thumbnail

Second slice: the clip that appeared in Phase 4 now actually plays and looks recognisable in the panel.

- Fetch fresh presigned GET URL at drag time (or when a source row expands, if pre-fetching is preferred) and store it on the asset
- `hydrateAssets` branch for TAMS variant: on app reload, re-fetch segments from TAMS and replace stale URLs before the compositor tries to load them
- Best-effort thumbnail via hidden `<video>` seek to midpoint of the first segment; icon fallback on CORS block or decode failure
- Wire `tams-thumbnail.ts` into `TamsFlowCard` so thumbnails appear while browsing, before drag

**Feedback target:** Does playback work in the preview? Any CORS or codec issues? Does thumbnail generation feel slow or block the UI?

### Phase 6 — Session durability (presigned URL refresh)

Third slice: a session longer than ~1 hour stays uninterrupted. This slice has no visible UI change — the feedback is that things keep working.

- `tamsUrlCache` singleton: `getFreshUrl(assetId)` returns cached URL or re-fetches segments when within 5 minutes of expiry
- `useTamsUrlRefresh` hook mounted at the root layout: sweeps all timeline-referenced TAMS assets every 60 seconds
- Player routes TAMS clip URLs through `getFreshUrl` instead of reading `asset.url` directly
- 403 from presigned URL host → `EXPIRED_URL` `TamsError` → cache invalidates and retries once after re-fetch

**Feedback target:** Does a 1h+ editing session stay uninterrupted? Does the 60 s background sweep cause any noticeable jank or network noise?

### Phase 7 — Export to TAMS

- Export dialog collects **Source label** and **Flow label** from the user before export begins; both fields are pre-filled with the project name as a sensible default
- `exportTimelineToTams` orchestrator: `sources.create` → `flows.create` → `allocateStorage` → `PUT` → `registerSegment`; passes the user-supplied labels into the respective create calls
- Progress dialog with per-step feedback; success state shows a link to the new source using the label the user entered
- Wire into editor export menu
- Playwright round-trip E2E test

### Phase 8 — Export back to an existing source

Fourth slice: when the timeline was opened from a TAMS source (i.e. every clip on the timeline originates from the same source), the export dialog offers a shortcut to publish the result as a new Flow under that same source rather than creating a brand-new source.

#### Export target selection

The export dialog gains a radio/segmented control:

- **New source** (default) — same as Phase 7; user fills in Source label + Flow label
- **Existing source** — user picks a source from a searchable dropdown; only a **Flow label** is required; Source label field is hidden

The "existing source" option is pre-selected and the originating source pre-filled when the dialog detects that all TAMS clips on the timeline share one `tamsSourceId`.

#### Detecting the originating source

A `getTimelineTamsSourceId()` helper inspects the current timeline clips: if every TAMS clip has the same `tamsSourceId` (and there is at least one TAMS clip), it returns that source ID; otherwise `null`. The export dialog calls this on open.

#### Orchestrator change

`exportTimelineToTams` gains an optional `existingSourceId` parameter. When provided, the `sources.create` step is skipped and the existing source ID is used directly for `flows.create`.

**Feedback target:** Does the new Flow appear under the correct source in the TAMS panel immediately after export? Does the source selector feel discoverable when clips come from mixed sources?

## Key Risks

| Risk | Mitigation |
|---|---|
| `MediaAsset.file` refactor touches many call sites | Do the discriminated union change in one commit; `pnpm typecheck` catches every breakage before any new behavior is layered on |
| Presigned URL CORS blocks `<video>` thumbnail/playback | Coordinate CORS headers with yletams early; ship icon fallback so the feature degrades gracefully |
| Credentials logged accidentally | `TamsError` strips `Authorization` header; `useTamsAuthStore` state never serialized to console |
| Drag-start fetch latency feels sluggish | Prefetch segments when source row expands, not on drag start |
| Schema drift between yletams and client | Fixture tests run against a real yletams instance; CI step re-validates fixtures |
| Multi-step export failures leave dangling TAMS resources | Progress callbacks at each step; on failure, surface clear error with which step failed |

## Success Criteria

- [ ] Phase 1: `@tooscut/tams-client` builds, exports a typed client, >80% unit coverage, fixture tests pass
- [ ] Phase 2: User can log in with username/password; "Test connection" succeeds against live yletams; credentials cleared on logout/refresh
- [ ] Phase 3: "TAMS" tab visible; sources are searchable; expanding a source shows its flows
- [ ] Phase 4: Dragging a TAMS flow to the timeline produces a clip with correct name and duration; trim/split work identically to local clips (playback not required yet)
- [ ] Phase 5: The dragged clip plays in the preview; thumbnails appear on flow cards; no CORS or codec regressions
- [ ] Phase 6: Editing session >1h stays uninterrupted; 403 from presigned URL triggers transparent re-fetch; 60s sweep causes no visible jank
- [ ] Phase 7: User can supply a Source label and Flow label before export; exporting produces a new Source + Flow + Segment with those labels that re-imports cleanly into the editor
- [ ] Phase 8: When all timeline clips share one TAMS source, the export dialog pre-selects that source; exporting adds the new Flow under the existing source without creating a duplicate source

## TAMS Domain Reference

- **Source** — abstract media concept (`id`, `format`, `label`, `tags`)
- **Flow** — concrete rendition of a Source (`codec`, `container`, `essence_parameters`)
- **Flow Segment** — maps a timerange to a Media Object (S3 blob); includes `get_urls` (presigned GET URLs)
- **Timerange format** — `[sec:nsec_sec:nsec)` where brackets indicate inclusivity; `_` means unbounded
- **Auth** — Basic auth (`username:password`) or Bearer token; users defined in `auth-users.edn`

## Local Dev

```sh
# Start yletams (TAMS API)
cd yletams && make start        # PostgreSQL + LocalStack + Clojure server on :3000
# Swagger UI: http://localhost:3000/swagger-ui

# Default credentials (from auth-users.edn)
# admin / admin  (read + write)
# reader / reader  (read only)

# Set API URL for tooscut dev
echo "VITE_TAMS_API_URL=http://localhost:3000" >> tooscut/.env.local
```
