import type { FlowSegment } from "@tooscut/tams-client";
import { useCallback, useEffect, useMemo, useRef } from "react";

const MIME_TYPE = "video/mp2t";
const BUFFER_WINDOW_SEC = 600;

export function useMsePlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  segments: FlowSegment[],
): boolean {
  const mseSupported = useMemo(
    () => typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(MIME_TYPE),
    [],
  );

  const sourceBufferRef = useRef<SourceBuffer | null>(null);
  const queueRef = useRef<FlowSegment[]>([]);
  const appendedIdsRef = useRef(new Set<string>());
  const isFetchingRef = useRef(false);
  const isEvictingRef = useRef(false);
  const atLiveEdgeRef = useRef(false);

  const processQueue = useCallback(async () => {
    const sb = sourceBufferRef.current;
    const video = videoRef.current;
    if (!sb || sb.updating || isFetchingRef.current || queueRef.current.length === 0) return;

    const seg = queueRef.current.shift()!;
    const url = seg.get_urls?.[0]?.url;
    if (!url) {
      void processQueue();
      return;
    }

    isFetchingRef.current = true;
    try {
      const resp = await fetch(url);
      if (!resp.ok) return;
      const buffer = await resp.arrayBuffer();
      const currentSb = sourceBufferRef.current;
      if (currentSb && !currentSb.updating && video) {
        currentSb.appendBuffer(buffer);
      }
    } catch {
      void processQueue();
    } finally {
      isFetchingRef.current = false;
    }
  }, [videoRef]);

  // Initialize MediaSource and wire up the SourceBuffer
  useEffect(() => {
    if (!mseSupported) return;
    const video = videoRef.current;
    if (!video) return;

    const ms = new MediaSource();
    const objectUrl = URL.createObjectURL(ms);
    video.src = objectUrl;
    // Kick off play() while still close to the user gesture that opened the overlay.
    // The video will stay in "waiting" until MSE has buffered data.
    video.play().catch(() => {});

    const onSourceOpen = () => {
      let sb: SourceBuffer;
      try {
        sb = ms.addSourceBuffer(MIME_TYPE);
      } catch {
        return;
      }
      sourceBufferRef.current = sb;

      sb.addEventListener("updateend", () => {
        if (isEvictingRef.current) {
          isEvictingRef.current = false;
          void processQueue();
          return;
        }

        // After the first segment lands, seek to its start so the video has
        // data to play immediately rather than stalling at the buffer edge.
        if (!atLiveEdgeRef.current && sb.buffered.length > 0) {
          atLiveEdgeRef.current = true;
          video.currentTime = sb.buffered.start(0);
          video.play().catch(() => {});
        }

        // Evict data older than the buffer window
        if (sb.buffered.length > 0) {
          const end = sb.buffered.end(sb.buffered.length - 1);
          const start = sb.buffered.start(0);
          const evictTo = end - BUFFER_WINDOW_SEC;
          if (evictTo > start) {
            isEvictingRef.current = true;
            sb.remove(start, evictTo);
            return;
          }
        }

        void processQueue();
      });
    };

    ms.addEventListener("sourceopen", onSourceOpen);

    return () => {
      ms.removeEventListener("sourceopen", onSourceOpen);
      URL.revokeObjectURL(objectUrl);
      video.src = "";
      sourceBufferRef.current = null;
      queueRef.current = [];
      appendedIdsRef.current.clear();
      isFetchingRef.current = false;
      isEvictingRef.current = false;
      atLiveEdgeRef.current = false;
    };
  }, [mseSupported, videoRef, processQueue]);

  // Enqueue newly arrived segments
  useEffect(() => {
    let hasNew = false;
    for (const seg of segments) {
      if (!appendedIdsRef.current.has(seg.object_id)) {
        appendedIdsRef.current.add(seg.object_id);
        queueRef.current.push(seg);
        hasNew = true;
      }
    }
    if (hasNew) void processQueue();
  }, [segments, processQueue]);

  return mseSupported;
}
