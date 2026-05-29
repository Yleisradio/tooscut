import type { FlowSegment } from "@tooscut/tams-client";
import { useEffect, useRef, useState } from "react";

const SEGMENTS_BEHIND_LIVE = 3;

// Maps MediaError codes to readable strings.
function describeMediaError(err: MediaError): string {
  switch (err.code) {
    case MediaError.MEDIA_ERR_ABORTED: return "Playback aborted";
    case MediaError.MEDIA_ERR_NETWORK: return "Network error fetching segment";
    case MediaError.MEDIA_ERR_DECODE: return "Decoding error — corrupt segment?";
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
      return "Format not supported — segments may still be MPEG-TS; restart the ingest script to get fMP4";
    default: return `Media error ${err.code}`;
  }
}

export interface SequentialPlayerState {
  playing: boolean;
  error: string | null;
  lastUrl: string | null;
}

export function useSequentialPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  segments: FlowSegment[],
): SequentialPlayerState {
  const currentIndexRef = useRef(-1);
  const segmentsRef = useRef<FlowSegment[]>([]);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  segmentsRef.current = segments;

  // Wire up event handlers once — they read the latest state via refs.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const playAt = (index: number) => {
      const segs = segmentsRef.current;
      if (index < 0 || index >= segs.length) return;
      const url = segs[index]?.get_urls?.[0]?.url;
      if (!url) return;
      currentIndexRef.current = index;
      setLastUrl(url);
      video.src = url;
      video.play().catch(() => {});
    };

    const onEnded = () => playAt(currentIndexRef.current + 1);
    const onPlay = () => { setPlaying(true); setError(null); };
    const onPause = () => setPlaying(false);
    const onError = () => {
      const mediaErr = video.error;
      const detail = mediaErr
        ? `${describeMediaError(mediaErr)}${mediaErr.message ? ` (${mediaErr.message})` : ""}`
        : "Unknown media error";
      setError(detail);
      setPlaying(false);
    };

    video.addEventListener("ended", onEnded);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
    };
  }, [videoRef]);

  // Start near the live edge on first segments; advance only when a segment
  // has fully ended and the next one has arrived.
  //
  // Do NOT check video.paused — while loading (play() pending) or when autoplay
  // is blocked, paused is also true, which would cause the player to skip
  // segments on every poller tick before any frame renders.
  useEffect(() => {
    if (segments.length === 0) return;
    const video = videoRef.current;
    if (!video) return;

    const idx = currentIndexRef.current;

    if (idx === -1) {
      const startIndex = Math.max(0, segments.length - SEGMENTS_BEHIND_LIVE);
      const url = segments[startIndex]?.get_urls?.[0]?.url;
      if (!url) return;
      currentIndexRef.current = startIndex;
      setLastUrl(url);
      video.src = url;
      video.play().catch(() => {});
      return;
    }

    if (video.ended && idx + 1 < segments.length) {
      const url = segments[idx + 1]?.get_urls?.[0]?.url;
      if (!url) return;
      currentIndexRef.current = idx + 1;
      setLastUrl(url);
      video.src = url;
      video.play().catch(() => {});
    }
  }, [segments, videoRef]);

  return { playing, error, lastUrl };
}
