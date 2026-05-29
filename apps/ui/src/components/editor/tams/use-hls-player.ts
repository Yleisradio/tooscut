import Hls, {
  type HlsConfig,
  type Loader,
  type LoaderCallbacks,
  type LoaderConfiguration,
  type LoaderStats,
  type PlaylistLoaderContext,
} from "hls.js";
import type { FlowSegment } from "@tooscut/tams-client";
import { parseTimerange } from "@tooscut/tams-client";
import { useEffect, useRef, useState } from "react";

const LIVE_PLAYLIST_URL = "x-tams://live.m3u8";
const FALLBACK_SEGMENT_DURATION = 4;

// Init segments are marked by a sub-millisecond timerange (the ingest script
// uses [0:0_0:1), i.e. 1 ns). The UI emits them as #EXT-X-MAP rather than as
// media segments so hls.js wires them as the SourceBuffer init data.
export function isInitSegment(seg: FlowSegment): boolean {
  try {
    const parsed = parseTimerange(seg.timerange);
    if (!parsed.start || !parsed.end) return false;
    const startNs = parsed.start.sec * 1e9 + parsed.start.nsec;
    const endNs = parsed.end.sec * 1e9 + parsed.end.nsec;
    return endNs - startNs <= 1_000_000; // ≤1 ms = init marker
  } catch {
    return false;
  }
}

function segmentDuration(seg: FlowSegment): number {
  try {
    const parsed = parseTimerange(seg.timerange);
    if (parsed.start && parsed.end) {
      return parsed.end.sec + parsed.end.nsec / 1e9 -
        (parsed.start.sec + parsed.start.nsec / 1e9);
    }
  } catch {
    // fall through
  }
  return FALLBACK_SEGMENT_DURATION;
}

function generateM3u8(segments: FlowSegment[]): string {
  const initSeg = segments.find(isInitSegment);
  const mediaSegs = segments.filter((s) => !isInitSegment(s));

  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    `#EXT-X-TARGETDURATION:${FALLBACK_SEGMENT_DURATION}`,
    "#EXT-X-MEDIA-SEQUENCE:0",
  ];

  const initUrl = initSeg?.get_urls?.[0]?.url;
  if (initUrl) {
    lines.push(`#EXT-X-MAP:URI="${initUrl}"`);
  }

  for (const seg of mediaSegs) {
    const url = seg.get_urls?.[0]?.url;
    if (!url) continue;
    lines.push(`#EXTINF:${segmentDuration(seg).toFixed(3)},`);
    lines.push(url);
  }

  // No #EXT-X-ENDLIST — signals live stream; hls.js keeps polling for updates

  return lines.join("\n");
}

function makeStats(): LoaderStats {
  const now = performance.now();
  return {
    aborted: false,
    loaded: 0,
    retry: 0,
    total: 0,
    chunkCount: 0,
    bwEstimate: 0,
    loading: { start: now, first: now, end: now },
    parsing: { start: 0, end: 0 },
    buffering: { start: 0, first: 0, end: 0 },
  };
}

// Builds the pLoader class inside the hook so segmentsRef is captured in closure.
function buildPlaylistLoader(
  segmentsRef: React.MutableRefObject<FlowSegment[]>,
): new (config: HlsConfig) => Loader<PlaylistLoaderContext> {
  return class TamsPlaylistLoader implements Loader<PlaylistLoaderContext> {
    context: PlaylistLoaderContext | null = null;
    stats: LoaderStats = makeStats();
    private timer: ReturnType<typeof setTimeout> | null = null;

    load(
      context: PlaylistLoaderContext,
      _config: LoaderConfiguration,
      callbacks: LoaderCallbacks<PlaylistLoaderContext>,
    ) {
      this.context = context;
      const m3u8 = generateM3u8(segmentsRef.current);
      const stats: LoaderStats = {
        ...makeStats(),
        loaded: m3u8.length,
        total: m3u8.length,
      };
      this.stats = stats;
      // Defer to next macrotask so hls.js can finish its synchronous setup
      // (level switching, attachMedia, BUFFER_RESET, etc.) before processing
      // the manifest. Resolving synchronously inside loadSource/level-refresh
      // makes hls.js abort in-flight init loads.
      this.timer = setTimeout(() => {
        this.timer = null;
        callbacks.onSuccess({ data: m3u8, url: context.url }, stats, context, null);
      }, 0);
    }

    abort() {
      if (this.timer !== null) {
        clearTimeout(this.timer);
        this.timer = null;
      }
    }
    destroy() {
      this.abort();
    }
  };
}

export interface HlsPlayerState {
  supported: boolean;
  playing: boolean;
  error: string | null;
}

export function useHlsPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  segments: FlowSegment[],
): HlsPlayerState {
  const segmentsRef = useRef<FlowSegment[]>([]);
  segmentsRef.current = segments;

  const supported = Hls.isSupported();
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hlsRef = useRef<Hls | null>(null);
  const hasSegments = segments.length > 0;

  // Initialize hls.js once the first segments arrive. Initializing earlier with
  // an empty playlist triggers a fatal levelEmptyError before our poller can
  // populate segmentsRef. The pLoader still returns the latest segments on
  // every subsequent playlist refresh, so new segments are picked up live.
  useEffect(() => {
    if (!supported) return;
    if (!hasSegments) return;
    if (hlsRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    const hls = new Hls({
      pLoader: buildPlaylistLoader(segmentsRef),
      liveSyncDurationCount: 2,
      liveMaxLatencyDurationCount: 5,
      manifestLoadingMaxRetry: 20,
      levelLoadingMaxRetry: 20,
      // Disable LL-HLS — our playlists don't use partial segments and the
      // ll-hls code path triggers weird "part-N--1" scheduling.
      lowLatencyMode: false,
      // Disable the interstitials controller. It keeps calling startLoad(0)
      // and parking the stream-controller in STOPPED so the init segment is
      // never fetched. The type expects a constructor, hence the cast.
      interstitialsController: undefined as unknown as typeof Hls.DefaultConfig.interstitialsController,
    });
    hlsRef.current = hls;

    // Use hls.js's canonical lifecycle:
    //   attachMedia → MEDIA_ATTACHED → loadSource → MANIFEST_PARSED → play
    // Our pLoader is synchronous, so calling loadSource before attachMedia
    // would let manifest parsing race ahead of MediaSource setup and trip
    // "Levels were reset while loading level -1".
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(LIVE_PLAYLIST_URL);
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });

    hls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        setError(`${data.type}: ${data.details}${data.error?.message ? ` — ${data.error.message}` : ""}`);
      }
    });

    const onPlay = () => { setPlaying(true); setError(null); };
    const onPause = () => setPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);

    hls.attachMedia(video);

    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      hls.destroy();
      hlsRef.current = null;
    };
  }, [supported, videoRef, hasSegments]);

  return { supported, playing, error };
}
