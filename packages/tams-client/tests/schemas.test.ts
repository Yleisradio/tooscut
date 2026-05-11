import { describe, expect, it } from "vitest";
import {
  FlowSchema,
  FlowSegmentSchema,
  SourceSchema,
  StorageAllocationSchema,
} from "../src/schemas.js";
import flowFixture from "./fixtures/flow.json";
import segmentsFixture from "./fixtures/segments.json";
import sourceFixture from "./fixtures/source.json";
import storageFixture from "./fixtures/storage-allocation.json";

describe("SourceSchema", () => {
  it("parses a valid source fixture", () => {
    const result = SourceSchema.safeParse(sourceFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("00000000-0000-0000-0000-000000000001");
      expect(result.data.format).toBe("urn:x-nmos:format:video");
      expect(result.data.label).toBe("Test Source");
    }
  });

  it("rejects a source missing required fields", () => {
    const result = SourceSchema.safeParse({ label: "No format or id" });
    expect(result.success).toBe(false);
  });

  it("rejects a source with a non-UUID id", () => {
    const result = SourceSchema.safeParse({ ...sourceFixture, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });
});

describe("FlowSchema", () => {
  it("parses a valid flow fixture", () => {
    const result = FlowSchema.safeParse(flowFixture);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe("00000000-0000-0000-0000-000000000002");
      expect(result.data.source_id).toBe("00000000-0000-0000-0000-000000000001");
      expect(result.data.essence_parameters?.frame_width).toBe(1920);
      expect(result.data.essence_parameters?.frame_height).toBe(1080);
      expect(result.data.essence_parameters?.frame_rate?.numerator).toBe(25);
    }
  });

  it("parses a flow with null nullable fields", () => {
    const result = FlowSchema.safeParse({ ...flowFixture, codec: null, label: null });
    expect(result.success).toBe(true);
  });

  it("rejects a flow missing source_id", () => {
    const { source_id: _, ...noSourceId } = flowFixture;
    const result = FlowSchema.safeParse(noSourceId);
    expect(result.success).toBe(false);
  });
});

describe("FlowSegmentSchema", () => {
  it("parses a valid segments fixture", () => {
    const result = segmentsFixture.map((s) => FlowSegmentSchema.safeParse(s));
    expect(result.every((r) => r.success)).toBe(true);
  });

  it("parses a segment without get_urls (not yet served)", () => {
    const result = FlowSegmentSchema.safeParse({
      object_id: "xyz",
      timerange: "[0:0_10:0)",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a segment missing object_id", () => {
    const result = FlowSegmentSchema.safeParse({ timerange: "[0:0_10:0)" });
    expect(result.success).toBe(false);
  });
});

describe("StorageAllocationSchema", () => {
  it("parses a valid storage allocation fixture", () => {
    const result = storageFixture.map((s) => StorageAllocationSchema.safeParse(s));
    expect(result.every((r) => r.success)).toBe(true);
    if (result[0].success) {
      expect(result[0].data.object_id).toBe("newobj789");
    }
  });

  it("parses an allocation without expires", () => {
    const result = StorageAllocationSchema.safeParse({
      object_id: "abc",
      put_url: "https://example.com/put",
    });
    expect(result.success).toBe(true);
  });
});
