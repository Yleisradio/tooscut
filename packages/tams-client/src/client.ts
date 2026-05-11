import { createFlowsRepo, type FlowsRepository } from "./flows-repo.js";
import { createSourcesRepo, type SourcesRepository } from "./sources-repo.js";
import type { TamsClientConfig } from "./types.js";

export type TamsClient = {
  sources: SourcesRepository;
  flows: FlowsRepository;
};

export function createTamsClient(config: TamsClientConfig): TamsClient {
  return {
    sources: createSourcesRepo(config),
    flows: createFlowsRepo(config),
  };
}

export { TamsError } from "./errors.js";
export type { TamsErrorCode } from "./errors.js";
export { parseTimerange, formatTimerange, timerangeDurationSeconds, secondsToTimerange } from "./timerange.js";
export type {
  TamsClientConfig,
  Source,
  Flow,
  FlowSegment,
  GetUrl,
  StorageAllocation,
  EssenceParameters,
  SourceInput,
  FlowInput,
  SegmentInput,
  ListSourcesQuery,
  ListSegmentsQuery,
  ParsedTimerange,
} from "./types.js";
