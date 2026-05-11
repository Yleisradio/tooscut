import { z } from "zod";
import { request } from "./http.js";
import {
  FlowInputSchema,
  FlowSchema,
  FlowSegmentSchema,
  SegmentInputSchema,
} from "./schemas.js";
import type {
  Flow,
  FlowInput,
  FlowSegment,
  ListSegmentsQuery,
  SegmentInput,
  StorageAllocation,
  TamsClientConfig,
} from "./types.js";

export type FlowsRepository = {
  listForSource: (sourceId: string) => Promise<Flow[]>;
  findById: (flowId: string) => Promise<Flow>;
  create: (input: FlowInput) => Promise<Flow>;
  getSegments: (flowId: string, query?: ListSegmentsQuery) => Promise<FlowSegment[]>;
  allocateStorage: (flowId: string, count?: number) => Promise<StorageAllocation[]>;
  registerSegment: (flowId: string, segment: SegmentInput) => Promise<void>;
};

export function createFlowsRepo(config: TamsClientConfig): FlowsRepository {
  return {
    listForSource(sourceId) {
      return request(config, z.array(FlowSchema), "GET", "flows", {
        query: { source_id: sourceId },
      });
    },

    findById(flowId) {
      return request(config, FlowSchema, "GET", `flows/${flowId}`);
    },

    create(input) {
      const validated = FlowInputSchema.parse(input);
      const id = validated.id ?? crypto.randomUUID();
      return request(config, FlowSchema, "PUT", `flows/${id}`, { body: { ...validated, id } });
    },

    getSegments(flowId, query) {
      return request(config, z.array(FlowSegmentSchema), "GET", `flows/${flowId}/segments`, {
        query: query as Record<string, string | number | boolean | undefined>,
      });
    },

    async allocateStorage(flowId, count = 1) {
      // Server returns { media_objects: [{ object_id, put_url: { url, method } }] }
      const RawSchema = z.object({
        media_objects: z.array(
          z.object({
            object_id: z.string(),
            put_url: z.object({ url: z.string(), method: z.string() }),
          }),
        ),
      });
      const raw = await request(config, RawSchema, "POST", `flows/${flowId}/storage`, {
        body: { limit: count },
      });
      return raw.media_objects.map(
        (obj): StorageAllocation => ({ object_id: obj.object_id, put_url: obj.put_url.url }),
      );
    },

    async registerSegment(flowId, segment) {
      const validated = SegmentInputSchema.parse(segment);
      await request(config, z.unknown(), "POST", `flows/${flowId}/segments`, { body: validated });
    },
  };
}
