import type { Source, TamsClient, FlowSegment, Flow } from "@tooscut/tams-client";
import { ChevronDownIcon, ChevronRightIcon, AlertCircleIcon } from "lucide-react";
import { useState, useCallback } from "react";

import { TamsFlowCard } from "./tams-flow-card";

interface FlowWithSegment {
  flow: Flow;
  segment: FlowSegment | null;
}

interface TamsSourceRowProps {
  source: Source;
  client: TamsClient;
}

export function TamsSourceRow({ source, client }: TamsSourceRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [flows, setFlows] = useState<FlowWithSegment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleToggle = useCallback(async () => {
    if (!expanded && flows.length === 0 && !error) {
      setLoading(true);
      setError(null);
      try {
        const flowList = await client.flows.listForSource(source.id);
        const flowsWithSegments = await Promise.all(
          flowList.map(async (flow) => {
            try {
              const [firstSegs, lastSegs] = await Promise.all([
                client.flows.getSegments(flow.id, { limit: 1 }),
                client.flows.getSegments(flow.id, { limit: 1, reverse_order: true }),
              ]);
              const first = firstSegs[0] ?? null;
              const last = lastSegs[0] ?? null;
              if (!first) return { flow, segment: null };
              // Build a synthetic timerange spanning the full flow extent:
              // take the opening bracket+start from the first segment, end+closing bracket from the last.
              const spanTimerange = (a: string, b: string): string => {
                const startPart = a.slice(0, a.indexOf("_") + 1); // e.g. "[0:0_"
                const endPart = b.slice(b.indexOf("_") + 1);      // e.g. "3600:0)"
                return startPart + endPart;
              };
              const segment =
                last && last.timerange !== first.timerange
                  ? { ...first, timerange: spanTimerange(first.timerange, last.timerange) }
                  : first;
              return { flow, segment };
            } catch {
              return { flow, segment: null };
            }
          }),
        );
        setFlows(flowsWithSegments);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load flows");
      } finally {
        setLoading(false);
      }
    }
    setExpanded((prev) => !prev);
  }, [expanded, flows.length, error, client, source.id]);

  return (
    <div className="border-b border-border last:border-b-0">
      <button
        className="flex w-full items-start gap-1.5 px-2 py-2 text-left text-xs hover:bg-accent"
        onClick={() => void handleToggle()}
      >
        {expanded ? (
          <ChevronDownIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRightIcon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="min-w-0 flex-1 truncate font-medium" title={source.label ?? source.id}>
              {source.label ?? source.id}
            </span>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">
              {source.format.split(":").pop()}
            </span>
          </div>
          {source.description && (
            <p className="truncate text-[10px] text-muted-foreground" title={source.description}>
              {source.description}
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div className="flex flex-col gap-1 px-2 pb-2">
          {loading && (
            <p className="py-1 text-[10px] text-muted-foreground">Loading flows…</p>
          )}
          {error && (
            <p className="flex items-center gap-1 py-1 text-[10px] text-destructive">
              <AlertCircleIcon className="size-3" />
              {error}
            </p>
          )}
          {!loading && !error && flows.length === 0 && (
            <p className="py-1 text-[10px] text-muted-foreground">No flows</p>
          )}
          {flows.map(({ flow, segment }) => (
            <TamsFlowCard key={flow.id} flow={flow} segment={segment} />
          ))}
        </div>
      )}
    </div>
  );
}
