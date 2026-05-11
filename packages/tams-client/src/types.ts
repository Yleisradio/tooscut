import type { z } from "zod";
import type {
  EssenceParametersSchema,
  FlowInputSchema,
  FlowSchema,
  FlowSegmentSchema,
  GetUrlSchema,
  ListSegmentsQuerySchema,
  ListSourcesQuerySchema,
  SegmentInputSchema,
  SourceInputSchema,
  SourceSchema,
  StorageAllocationSchema,
  TimerangeSchema,
} from "./schemas.js";

export type Timerange = z.infer<typeof TimerangeSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type Flow = z.infer<typeof FlowSchema>;
export type FlowSegment = z.infer<typeof FlowSegmentSchema>;
export type GetUrl = z.infer<typeof GetUrlSchema>;
export type StorageAllocation = z.infer<typeof StorageAllocationSchema>;
export type EssenceParameters = z.infer<typeof EssenceParametersSchema>;
export type SourceInput = z.infer<typeof SourceInputSchema>;
export type FlowInput = z.infer<typeof FlowInputSchema>;
export type SegmentInput = z.infer<typeof SegmentInputSchema>;
export type ListSourcesQuery = z.infer<typeof ListSourcesQuerySchema>;
export type ListSegmentsQuery = z.infer<typeof ListSegmentsQuerySchema>;

export type TamsClientConfig = {
  baseUrl: string;
  username: string;
  password: string;
  /** Override the global fetch — primarily for testing */
  fetchImpl?: typeof fetch;
};

export type ParsedTimerange = {
  start: { sec: number; nsec: number } | null;
  end: { sec: number; nsec: number } | null;
  startInclusive: boolean;
  endInclusive: boolean;
};
