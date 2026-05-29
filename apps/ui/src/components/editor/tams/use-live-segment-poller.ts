import { type TamsClient, type FlowSegment, parseTimerange, formatTimerange } from "@tooscut/tams-client";
import { useEffect, useRef, useState } from "react";
import { isInitSegment } from "./use-hls-player";

const POLL_INTERVAL_MS = 2000;
const INITIAL_SEGMENT_COUNT = 5;

export function useLiveSegmentPoller(flowId: string, client: TamsClient): FlowSegment[] {
  const [segments, setSegments] = useState<FlowSegment[]>([]);
  const latestEndSecRef = useRef(0);
  const segmentIdsRef = useRef(new Set<string>());

  useEffect(() => {
    setSegments([]);
    latestEndSecRef.current = 0;
    segmentIdsRef.current = new Set();

    let cancelled = false;

    const fetchInitial = async () => {
      try {
        // Fetch the oldest segment (HLS fMP4 init at [0:0_0:1)) and the live
        // edge in parallel. Without the init segment hls.js has no codec
        // metadata to bootstrap the SourceBuffer.
        const [oldest, latest] = await Promise.all([
          client.flows.getSegments(flowId, { limit: 1 }),
          client.flows.getSegments(flowId, {
            limit: INITIAL_SEGMENT_COUNT,
            reverse_order: true,
          }),
        ]);
        if (cancelled) return;

        const byObjectId = new Map<string, FlowSegment>();
        for (const seg of oldest) byObjectId.set(seg.object_id, seg);
        for (const seg of latest) byObjectId.set(seg.object_id, seg);
        if (byObjectId.size === 0) return;

        const all = Array.from(byObjectId.values()).sort((a, b) => {
          const ta = parseTimerange(a.timerange).start?.sec ?? 0;
          const tb = parseTimerange(b.timerange).start?.sec ?? 0;
          return ta - tb;
        });

        for (const seg of all) {
          segmentIdsRef.current.add(seg.object_id);
        }

        // Track the live edge based on media segments only (init is at 0:1ns).
        const media = all.filter((s) => !isInitSegment(s));
        if (media.length > 0) {
          const lastSeg = media[media.length - 1]!;
          const parsed = parseTimerange(lastSeg.timerange);
          latestEndSecRef.current = parsed.end?.sec ?? 0;
        }

        if (!cancelled) setSegments(all);
      } catch {
        // retry on next poll
      }
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const endSec = latestEndSecRef.current;
        const timerange = formatTimerange({
          start: { sec: endSec, nsec: 0 },
          end: null,
          startInclusive: false,
          endInclusive: false,
        });
        const newSegs = await client.flows.getSegments(flowId, { timerange });
        if (cancelled || newSegs.length === 0) return;

        const novel = newSegs.filter((s) => !segmentIdsRef.current.has(s.object_id));
        if (novel.length === 0) return;

        for (const seg of novel) {
          segmentIdsRef.current.add(seg.object_id);
        }

        const lastSeg = novel[novel.length - 1]!;
        const parsed = parseTimerange(lastSeg.timerange);
        latestEndSecRef.current = parsed.end?.sec ?? latestEndSecRef.current;

        if (!cancelled) setSegments((prev) => [...prev, ...novel]);
      } catch {
        // retry on next poll
      }
    };

    void fetchInitial();
    // Keep redoing the parallel "oldest + latest" fetch while we have no
    // segments — otherwise opening the overlay before any segments exist
    // would leave the timerange-based poll() permanently skipping the init.
    const interval = setInterval(() => {
      if (segmentIdsRef.current.size === 0) {
        void fetchInitial();
      } else {
        void poll();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [flowId, client]);

  return segments;
}
