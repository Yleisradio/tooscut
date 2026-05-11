import type { Flow, FlowSegment } from "@tooscut/tams-client";
import { timerangeDurationSeconds } from "@tooscut/tams-client";
import { Video, Music } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useVideoEditorStore } from "../../../state/video-editor-store";
import { addTamsAssetToStores, formatDuration } from "../../timeline/use-asset-store";
import { flowToMediaAsset } from "./tams-to-asset";
import { generateTamsThumbnail } from "./tams-thumbnail";
import { tamsUrlCache } from "./tams-url-cache";

interface TamsFlowCardProps {
  flow: Flow;
  segment: FlowSegment | null;
}

export function TamsFlowCard({ flow, segment }: TamsFlowCardProps) {
  const projectFps = useVideoEditorStore((s) => s.settings.fps);

  const durationSec = segment ? timerangeDurationSeconds(segment.timerange) : 0;
  const isAudio = flow.format.includes(":audio");
  const codec = flow.codec ?? flow.format.split(":").pop() ?? "unknown";
  const presignedUrl = segment?.get_urls?.[0]?.url ?? "";

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Only generate thumbnail once the card scrolls into view
  useEffect(() => {
    if (!presignedUrl || isAudio) return;

    const el = rootRef.current;
    if (!el) return;

    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        observer.disconnect();
        void generateTamsThumbnail(presignedUrl).then((url) => {
          if (!cancelled) setThumbnailUrl(url);
        });
      },
      { threshold: 0.1 },
    );

    observer.observe(el);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [presignedUrl, isAudio]);

  const handleDragStart = (e: React.DragEvent) => {
    const { ui, store } = flowToMediaAsset(flow, segment, projectFps);
    const uiWithThumb: typeof ui = thumbnailUrl ? { ...ui, thumbnailUrl } : ui;
    const assetId = addTamsAssetToStores(uiWithThumb, store);
    if (presignedUrl) tamsUrlCache.set(assetId, presignedUrl);

    e.dataTransfer.setData("application/x-asset-id", assetId);
    e.dataTransfer.setData(`application/x-asset-type-${ui.type}`, "");
    e.dataTransfer.setData(`application/x-asset-duration-${ui.duration}`, "");
    e.dataTransfer.effectAllowed = "copy";

    if (thumbnailUrl) {
      const img = new Image();
      img.src = thumbnailUrl;
      e.dataTransfer.setDragImage(img, 60, 34);
    }
  };

  return (
    <div
      ref={rootRef}
      className="group flex cursor-grab items-center gap-2 overflow-hidden rounded-md border border-border bg-background active:cursor-grabbing hover:bg-accent"
      draggable
      onDragStart={handleDragStart}
    >
      {/* Thumbnail strip */}
      <div className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-l-md bg-muted">
        {thumbnailUrl ? (
          <img src={thumbnailUrl} alt="" className="size-full object-cover" />
        ) : isAudio ? (
          <Music className="size-3.5 text-muted-foreground" />
        ) : (
          <Video className="size-3.5 text-muted-foreground" />
        )}
      </div>

      {/* Label + duration */}
      <div className="flex min-w-0 flex-1 flex-col py-1.5 pr-2">
        <span className="truncate text-xs font-medium" title={flow.label ?? flow.id}>
          {flow.label ?? codec}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {durationSec > 0 ? formatDuration(durationSec) : "∞"}
        </span>
      </div>
    </div>
  );
}
