import { z } from "zod";

export const TimerangeSchema = z.string();

export const FrameRateSchema = z.object({
  numerator: z.number().int().positive(),
  denominator: z.number().int().positive(),
});

export const EssenceParametersSchema = z
  .object({
    frame_width: z.number().int().optional(),
    frame_height: z.number().int().optional(),
    frame_rate: FrameRateSchema.optional(),
    interlace_mode: z.string().optional(),
    colorimetry: z.string().optional(),
    bit_depth: z.number().int().optional(),
    sample_rate: z.number().int().optional(),
    channels: z.number().int().optional(),
    bits_per_sample: z.number().int().optional(),
    coded_width: z.number().int().optional(),
    coded_height: z.number().int().optional(),
    aspect_ratio: z
      .object({ numerator: z.number().int(), denominator: z.number().int() })
      .optional(),
  })
  .passthrough();

export const SourceSchema = z.object({
  id: z.string().uuid(),
  format: z.string(),
  label: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tags: z.record(z.unknown()).optional(),
  created_by: z.string().nullable().optional(),
  updated_by: z.string().nullable().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
});

export const FlowSchema = z.object({
  id: z.string().uuid(),
  source_id: z.string().uuid(),
  format: z.string(),
  codec: z.string().nullable().optional(),
  container: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tags: z.record(z.unknown()).optional(),
  read_only: z.boolean().optional(),
  generation: z.number().int().nullable().optional(),
  essence_parameters: EssenceParametersSchema.nullable().optional(),
  flow_collection: z.unknown().nullable().optional(),
  collected_by: z.array(z.unknown()).optional(),
  container_mapping: z.unknown().nullable().optional(),
  avg_bit_rate: z.number().int().nullable().optional(),
  max_bit_rate: z.number().int().nullable().optional(),
  segment_duration: z.unknown().nullable().optional(),
  metadata_version: z.string().nullable().optional(),
  created_by: z.string().nullable().optional(),
  updated_by: z.string().nullable().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
  metadata_updated_at: z.string().optional(),
  segments_updated_at: z.string().nullable().optional(),
});

export const GetUrlSchema = z.object({
  url: z.string(),
  label: z.string().optional(),
});

export const FlowSegmentSchema = z.object({
  object_id: z.string(),
  timerange: TimerangeSchema,
  get_urls: z.array(GetUrlSchema).optional(),
  ts_offset: z.string().nullable().optional(),
  object_timerange: z.string().nullable().optional(),
  last_duration: z.string().nullable().optional(),
  sample_offset: z.number().int().nullable().optional(),
  sample_count: z.number().int().nullable().optional(),
  key_frame_count: z.number().int().nullable().optional(),
});

export const StorageAllocationSchema = z.object({
  object_id: z.string(),
  put_url: z.string(),
  expires: z.string().optional(),
});

export const SourceInputSchema = z.object({
  id: z.string().uuid().optional(),
  format: z.string(),
  label: z.string().optional(),
  description: z.string().optional(),
  tags: z.record(z.unknown()).optional(),
});

export const FlowInputSchema = z.object({
  id: z.string().uuid().optional(),
  source_id: z.string().uuid(),
  format: z.string(),
  codec: z.string().optional(),
  container: z.string().optional(),
  label: z.string().optional(),
  description: z.string().optional(),
  tags: z.record(z.unknown()).optional(),
  essence_parameters: EssenceParametersSchema.optional(),
});

export const SegmentInputSchema = z.object({
  object_id: z.string(),
  timerange: TimerangeSchema,
  ts_offset: z.string().nullable().optional(),
  object_timerange: z.string().nullable().optional(),
  last_duration: z.string().nullable().optional(),
  sample_offset: z.number().int().nullable().optional(),
  sample_count: z.number().int().nullable().optional(),
  key_frame_count: z.number().int().nullable().optional(),
});

export const ListSourcesQuerySchema = z.object({
  label: z.string().optional(),
  format: z.string().optional(),
  page: z.string().optional(),
  limit: z.number().int().positive().optional(),
});

export const ListSegmentsQuerySchema = z.object({
  timerange: TimerangeSchema.optional(),
  page: z.string().optional(),
  limit: z.number().int().positive().optional(),
  reverse_order: z.boolean().optional(),
});
