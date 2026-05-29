import type { Flow, FlowSegment } from "@tooscut/tams-client";
import { ScissorsIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useVideoEditorStore } from "../../../state/video-editor-store";
import { addTamsAssetToStores } from "../../timeline/use-asset-store";
import { Button } from "../../ui/button";
import { buildLiveClip } from "./build-live-clip";
import { tamsUrlCache } from "./tams-url-cache";

interface LiveMarkControlsProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  flow: Flow | null;
  segments: FlowSegment[];
}

function formatTime(seconds: number | null): string {
  if (seconds === null) return "—:—";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LiveMarkControls({ videoRef, flow, segments }: LiveMarkControlsProps) {
  const projectFps = useVideoEditorStore((s) => s.settings.fps);
  const [inSec, setInSec] = useState<number | null>(null);
  const [outSec, setOutSec] = useState<number | null>(null);

  // Mirror volatile state into refs so the single keyboard listener below
  // always sees the latest values without needing to re-register.
  const inRef = useRef<number | null>(inSec);
  const outRef = useRef<number | null>(outSec);
  const flowRef = useRef<Flow | null>(flow);
  const segmentsRef = useRef<FlowSegment[]>(segments);
  const fpsRef = useRef(projectFps);
  inRef.current = inSec;
  outRef.current = outSec;
  flowRef.current = flow;
  segmentsRef.current = segments;
  fpsRef.current = projectFps;

  const markIn = useCallback(() => {
    const t = videoRef.current?.currentTime;
    if (typeof t === "number" && Number.isFinite(t)) setInSec(t);
  }, [videoRef]);

  const markOut = useCallback(() => {
    const t = videoRef.current?.currentTime;
    if (typeof t === "number" && Number.isFinite(t)) setOutSec(t);
  }, [videoRef]);

  const clearMarks = useCallback(() => {
    setInSec(null);
    setOutSec(null);
  }, []);

  const clipBusyRef = useRef(false);
  const clip = useCallback(async () => {
    if (clipBusyRef.current) return;
    const f = flowRef.current;
    const i = inRef.current;
    const o = outRef.current;
    if (!f || i === null || o === null || o <= i) return;
    clipBusyRef.current = true;
    try {
      const built = await buildLiveClip(f, segmentsRef.current, i, o, fpsRef.current);
      if (!built) return;
      const assetId = addTamsAssetToStores(built.ui, built.store);
      // Skip caching for blob URLs — they don't expire and the URL refresher
      // would otherwise try to swap them for a (broken) presigned URL.
      if (built.ui.url && !built.ui.url.startsWith("blob:")) {
        tamsUrlCache.set(assetId, built.ui.url);
      }
      setInSec(null);
      setOutSec(null);
    } finally {
      clipBusyRef.current = false;
    }
  }, []);

  const canClip = !!flow && inSec !== null && outSec !== null && outSec > inSec;

  // Single, stable keyboard handler. Capturing once avoids races caused by
  // re-registering on every segments-update tick.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }
      // Modifier-combos belong to the timeline (undo, copy, etc.). Bail.
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key.toLowerCase()) {
        case "i":
          e.preventDefault();
          markIn();
          break;
        case "o":
          e.preventDefault();
          markOut();
          break;
        case "c":
        case "enter":
          e.preventDefault();
          void clip();
          break;
        case "x":
          if (inRef.current !== null || outRef.current !== null) {
            e.preventDefault();
            clearMarks();
          }
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markIn, markOut, clip, clearMarks]);

  // Blur button focus after click so a follow-up Enter doesn't re-click the
  // same button instead of activating our keyboard shortcut.
  const blurAfter = (fn: () => void | Promise<void>) => (e: React.MouseEvent<HTMLButtonElement>) => {
    void fn();
    e.currentTarget.blur();
  };

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        onClick={blurAfter(markIn)}
        title="Mark In (I)"
        className="h-6 px-2 text-xs"
      >
        Mark In
      </Button>
      <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(inSec)}
      </span>
      <Button
        size="sm"
        variant="ghost"
        onClick={blurAfter(markOut)}
        title="Mark Out (O)"
        className="h-6 px-2 text-xs"
      >
        Mark Out
      </Button>
      <span className="w-12 text-right font-mono text-xs tabular-nums text-muted-foreground">
        {formatTime(outSec)}
      </span>
      <Button
        size="icon"
        variant={canClip ? "default" : "ghost"}
        onClick={blurAfter(clip)}
        disabled={!canClip}
        title="Clip to asset bin (C / Enter)"
        className="size-6"
      >
        <ScissorsIcon className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={blurAfter(clearMarks)}
        disabled={inSec === null && outSec === null}
        title="Clear marks (X)"
        className="size-6"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}
