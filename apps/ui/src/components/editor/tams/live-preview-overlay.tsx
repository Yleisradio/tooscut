import type { Flow, TamsClient } from "@tooscut/tams-client";
import { PlayIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useTamsClient } from "../../../state/use-tams-client";
import { useLiveMonitorStore } from "../../../state/live-monitor-store";
import { Button } from "../../ui/button";
import { LiveMarkControls } from "./live-mark-controls";
import { useLiveSegmentPoller } from "./use-live-segment-poller";
import { useHlsPlayer } from "./use-hls-player";

function useFlow(client: TamsClient, flowId: string): Flow | null {
  const [flow, setFlow] = useState<Flow | null>(null);
  useEffect(() => {
    let cancelled = false;
    setFlow(null);
    client.flows
      .findById(flowId)
      .then((f) => {
        if (!cancelled) setFlow(f);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client, flowId]);
  return flow;
}

export function LivePreviewOverlay() {
  const flowId = useLiveMonitorStore((s) => s.flowId);
  const stopMonitoring = useLiveMonitorStore((s) => s.stopMonitoring);
  const client = useTamsClient();

  if (!flowId || !client) return null;

  return <LivePreviewOverlayInner flowId={flowId} client={client} onClose={stopMonitoring} />;
}

interface InnerProps {
  flowId: string;
  client: TamsClient;
  onClose: () => void;
}

function LivePreviewOverlayInner({ flowId, client, onClose }: InnerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const segments = useLiveSegmentPoller(flowId, client);
  const { supported, playing, error } = useHlsPlayer(videoRef, segments);
  const flow = useFlow(client, flowId);

  const handlePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.play().catch(() => {});
  };

  // Media segments only — the init segment ([0:0_0:1)) is metadata, not playable content.
  const mediaCount = segments.filter((s) => s.timerange !== "[0:0_0:1)").length;

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-background">
      <div className="relative flex-1 overflow-hidden bg-black">
        {supported ? (
          <video
            ref={videoRef}
            className="size-full object-contain"
            playsInline
            autoPlay
            onClick={handlePlay}
          />
        ) : (
          <div className="flex size-full items-center justify-center p-4 text-center">
            <p className="text-sm text-muted-foreground">
              Live preview requires MSE (Chrome, Firefox, or Edge).
            </p>
          </div>
        )}

        {/* Click-to-play — shown when autoplay was blocked or the user paused */}
        {supported && !playing && segments.length > 0 && (
          <button
            className="absolute inset-0 flex cursor-pointer items-center justify-center"
            onClick={handlePlay}
          >
            <div className="flex size-16 items-center justify-center rounded-full bg-black/60">
              <PlayIcon className="size-8 fill-white text-white" />
            </div>
          </button>
        )}

        {/* LIVE badge */}
        <div className="absolute right-2 top-2 flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5">
          <span className="size-1.5 animate-pulse rounded-full bg-white" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-white">Live</span>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-1.5">
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {error ? (
            <span className="text-destructive">{error}</span>
          ) : (
            <>Live Preview · {mediaCount} segment{mediaCount !== 1 ? "s" : ""} buffered</>
          )}
        </span>
        <LiveMarkControls videoRef={videoRef} flow={flow} segments={segments} />
        <Button size="icon" variant="ghost" className="size-6" onClick={onClose} title="Close live preview">
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
