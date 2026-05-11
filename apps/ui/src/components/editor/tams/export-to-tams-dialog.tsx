import { CloudUpload, XIcon } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { useLiveQuery } from "dexie-react-hooks";

import { useMp4Export } from "../../../hooks/use-mp4-export";
import { db } from "../../../state/db";
import { useVideoEditorStore } from "../../../state/video-editor-store";
import { useTamsClient } from "../../../state/use-tams-client";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Progress } from "../../ui/progress";
import { exportToTams, type TamsExportStep } from "./export-to-tams";

// ===================== TYPES =====================

interface ExportToTamsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

type DialogStep = "form" | "rendering" | TamsExportStep | "complete" | "error";

// ===================== HELPERS =====================

function stepLabel(step: DialogStep, renderStage?: string): string {
  switch (step) {
    case "form":
      return "";
    case "rendering":
      return renderStage ? renderStageLabel(renderStage) : "Rendering…";
    case "creating_flow":
      return "Creating flow…";
    case "labelling_source":
      return "Setting source label…";
    case "allocating":
      return "Allocating storage…";
    case "uploading":
      return "Uploading to TAMS…";
    case "registering":
      return "Registering segment…";
    case "complete":
      return "Export complete";
    case "error":
      return "Export failed";
  }
}

function renderStageLabel(stage: string): string {
  switch (stage) {
    case "preparing":
      return "Preparing…";
    case "rendering":
      return "Rendering frames…";
    case "encoding":
      return "Encoding audio…";
    case "finalizing":
      return "Finalizing…";
    default:
      return "Rendering…";
  }
}

// ===================== COMPONENT =====================

export function ExportToTamsDialog({ open, onOpenChange, projectId }: ExportToTamsDialogProps) {
  const project = useLiveQuery(() => db.projects.get(projectId), [projectId]);
  const settings = useVideoEditorStore((s) => s.settings);
  const client = useTamsClient();

  const defaultName = project?.name ?? "Untitled";

  const [sourceLabel, setSourceLabel] = useState(defaultName);
  const [flowLabel, setFlowLabel] = useState(defaultName);
  const [step, setStep] = useState<DialogStep>("form");
  const [error, setError] = useState<string>("");
  const [successSourceId, setSuccessSourceId] = useState<string>("");

  const { startExport, cancelExport, progress: renderProgress } = useMp4Export();

  // Sync default labels when project name resolves
  useEffect(() => {
    if (project?.name && step === "form") {
      setSourceLabel(project.name);
      setFlowLabel(project.name);
    }
  }, [project?.name, step]);

  // Reset on open
  useEffect(() => {
    if (open) {
      cancelExport();
      setStep("form");
      setError("");
      setSuccessSourceId("");
    }
  }, [open, cancelExport]);

  const handleExport = useCallback(async () => {
    if (!client) {
      setError("Not connected to TAMS. Please log in first.");
      setStep("error");
      return;
    }

    setStep("rendering");

    let result;
    try {
      result = await startExport({
        width: settings.width,
        height: settings.height,
        frameRate: settings.fps.numerator / settings.fps.denominator,
      });
    } catch (err) {
      if (err instanceof Error && err.message === "Export cancelled") return;
      setError(err instanceof Error ? err.message : "Render failed");
      setStep("error");
      return;
    }

    if (!result.buffer) {
      setError("Render produced no output.");
      setStep("error");
      return;
    }

    try {
      const tamsResult = await exportToTams(
        client,
        {
          sourceLabel: sourceLabel.trim() || defaultName,
          flowLabel: flowLabel.trim() || defaultName,
          buffer: result.buffer,
          durationSeconds: result.duration,
          settings: { width: settings.width, height: settings.height, fps: settings.fps },
        },
        (s) => setStep(s),
      );

      setSuccessSourceId(tamsResult.sourceId);
      setStep("complete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "TAMS upload failed");
      setStep("error");
    }
  }, [client, startExport, settings, sourceLabel, flowLabel, defaultName]);

  const handleCancel = useCallback(() => {
    cancelExport();
  }, [cancelExport]);

  const handleClose = useCallback(() => {
    if (step === "rendering") cancelExport();
    onOpenChange(false);
  }, [step, cancelExport, onOpenChange]);

  const isInProgress =
    step === "rendering" ||
    step === "creating_flow" ||
    step === "labelling_source" ||
    step === "allocating" ||
    step === "uploading" ||
    step === "registering";

  const renderPercent = renderProgress?.progress ?? 0;

  // Overall progress: rendering = 0–80%, TAMS steps = 80–100%
  const overallPercent =
    step === "rendering"
      ? Math.round(renderPercent * 0.8)
      : step === "creating_flow"
        ? 82
        : step === "labelling_source"
          ? 86
          : step === "allocating"
            ? 88
            : step === "uploading"
              ? 90
              : step === "registering"
                ? 97
                : step === "complete"
                  ? 100
                  : 0;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export to TAMS</DialogTitle>
          <DialogDescription>
            Render the timeline and publish it as a new TAMS source and flow.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel>
          {step === "form" && (
            <div className="grid gap-4 py-4">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="tams-source-label">
                  Source label
                </label>
                <Input
                  id="tams-source-label"
                  value={sourceLabel}
                  onChange={(e) => setSourceLabel(e.target.value)}
                  placeholder="e.g. My Project"
                />
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium" htmlFor="tams-flow-label">
                  Flow label
                </label>
                <Input
                  id="tams-flow-label"
                  value={flowLabel}
                  onChange={(e) => setFlowLabel(e.target.value)}
                  placeholder="e.g. Master export"
                />
              </div>
            </div>
          )}

          {isInProgress && (
            <div className="py-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">
                    {stepLabel(step, renderProgress?.stage)}
                  </span>
                  <span className="text-muted-foreground">{overallPercent}%</span>
                </div>
                <Progress value={overallPercent} />

                {step === "rendering" && renderProgress?.stage === "rendering" && (
                  <div className="grid grid-cols-2 gap-2 font-mono text-xs text-muted-foreground">
                    <div>
                      <span className="font-medium">Frame: </span>
                      {renderProgress.currentFrame} / {renderProgress.totalFrames}
                    </div>
                    {renderProgress.fps !== null && (
                      <div>
                        <span className="font-medium">Speed: </span>
                        {renderProgress.fps} fps
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {step === "complete" && (
            <div className="py-4">
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Published successfully</p>
                <p className="mt-1 text-muted-foreground">
                  Source:{" "}
                  <span className="font-mono text-xs">{successSourceId}</span>
                </p>
              </div>
            </div>
          )}

          {step === "error" && (
            <div className="py-4">
              <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                {error || "An unknown error occurred."}
              </div>
            </div>
          )}
        </DialogPanel>

        <DialogFooter>
          {step === "form" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                onClick={() => void handleExport()}
                disabled={!client}
              >
                <CloudUpload className="mr-2 size-4" />
                Export to TAMS
              </Button>
            </>
          )}

          {step === "rendering" && (
            <Button variant="destructive" onClick={handleCancel}>
              <XIcon className="mr-2 size-4" />
              Cancel
            </Button>
          )}

          {isInProgress && step !== "rendering" && (
            <Button variant="outline" disabled>
              Working…
            </Button>
          )}

          {step === "complete" && (
            <Button variant="outline" onClick={handleClose}>
              Done
            </Button>
          )}

          {step === "error" && (
            <>
              <Button variant="outline" onClick={handleClose}>
                Close
              </Button>
              <Button onClick={() => { setStep("form"); setError(""); }}>
                Try again
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
