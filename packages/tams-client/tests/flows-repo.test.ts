import { describe, expect, it, vi } from "vitest";
import { TamsError } from "../src/errors.js";
import { createFlowsRepo } from "../src/flows-repo.js";
import type { TamsClientConfig } from "../src/types.js";
import flowFixture from "./fixtures/flow.json";
import segmentsFixture from "./fixtures/segments.json";
import storageFixture from "./fixtures/storage-allocation.json";

function mockFetch(status: number, body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch;
}

const config: TamsClientConfig = {
  baseUrl: "http://localhost:3000",
  username: "admin",
  password: "admin",
  fetchImpl: mockFetch(200, [flowFixture]),
};

describe("FlowsRepository.listForSource", () => {
  it("calls GET /sources/:sourceId/flows", async () => {
    const fetchMock = mockFetch(200, [flowFixture]);
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    const flows = await repo.listForSource("00000000-0000-0000-0000-000000000001");

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "http://localhost:3000/sources/00000000-0000-0000-0000-000000000001/flows",
    );
    expect(init.method).toBe("GET");
    expect(flows).toHaveLength(1);
    expect(flows[0].source_id).toBe("00000000-0000-0000-0000-000000000001");
  });
});

describe("FlowsRepository.findById", () => {
  it("calls GET /flows/:flowId", async () => {
    const fetchMock = mockFetch(200, flowFixture);
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    const flow = await repo.findById("00000000-0000-0000-0000-000000000002");

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/flows/00000000-0000-0000-0000-000000000002");
    expect(flow.codec).toBe("video/h264");
  });
});

describe("FlowsRepository.create", () => {
  it("calls PUT /flows/:id with body", async () => {
    const fetchMock = mockFetch(200, flowFixture);
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    await repo.create({
      id: "00000000-0000-0000-0000-000000000002",
      source_id: "00000000-0000-0000-0000-000000000001",
      format: "urn:x-nmos:format:video",
      codec: "video/h264",
      container: "video/mp4",
    });

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://localhost:3000/flows/00000000-0000-0000-0000-000000000002");
    expect(init.method).toBe("PUT");
    const body = JSON.parse(init.body as string) as { source_id: string; codec: string };
    expect(body.source_id).toBe("00000000-0000-0000-0000-000000000001");
    expect(body.codec).toBe("video/h264");
  });
});

describe("FlowsRepository.getSegments", () => {
  it("calls GET /flows/:flowId/segments and returns segments with get_urls", async () => {
    const fetchMock = mockFetch(200, segmentsFixture);
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    const segments = await repo.getSegments("00000000-0000-0000-0000-000000000002");

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe(
      "http://localhost:3000/flows/00000000-0000-0000-0000-000000000002/segments",
    );
    expect(segments).toHaveLength(1);
    expect(segments[0].object_id).toBe("abc123def456");
    expect(segments[0].timerange).toBe("[0:0_30:0)");
    expect(segments[0].get_urls?.[0].url).toContain("abc123def456");
  });

  it("appends timerange query param when provided", async () => {
    const fetchMock = mockFetch(200, segmentsFixture);
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    await repo.getSegments("00000000-0000-0000-0000-000000000002", {
      timerange: "[0:0_10:0)",
    });

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("timerange=");
  });
});

describe("FlowsRepository.allocateStorage", () => {
  it("calls POST /flows/:flowId/storage and returns allocations", async () => {
    const fetchMock = mockFetch(200, storageFixture);
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    const allocations = await repo.allocateStorage("00000000-0000-0000-0000-000000000002");

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "http://localhost:3000/flows/00000000-0000-0000-0000-000000000002/storage",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { limit: number };
    expect(body.limit).toBe(1);
    expect(allocations[0].object_id).toBe("newobj789");
    expect(allocations[0].put_url).toContain("newobj789");
  });

  it("sends the requested count in the body", async () => {
    const fetchMock = mockFetch(200, storageFixture);
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    await repo.allocateStorage("00000000-0000-0000-0000-000000000002", 3);

    const [, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    const body = JSON.parse(init.body as string) as { limit: number };
    expect(body.limit).toBe(3);
  });
});

describe("FlowsRepository.registerSegment", () => {
  it("calls POST /flows/:flowId/segments with segment body", async () => {
    const fetchMock = mockFetch(200, {});
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    await repo.registerSegment("00000000-0000-0000-0000-000000000002", {
      object_id: "abc123",
      timerange: "[0:0_30:0)",
    });

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "http://localhost:3000/flows/00000000-0000-0000-0000-000000000002/segments",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string) as { object_id: string; timerange: string };
    expect(body.object_id).toBe("abc123");
    expect(body.timerange).toBe("[0:0_30:0)");
  });

  it("throws TamsError AUTH on 401", async () => {
    const fetchMock = mockFetch(401, { error: "Unauthorized" });
    const repo = createFlowsRepo({ ...config, fetchImpl: fetchMock });

    await expect(
      repo.registerSegment("flow-id", { object_id: "obj", timerange: "[0:0_1:0)" }),
    ).rejects.toMatchObject({ code: "AUTH" });
  });
});

describe("FlowsRepository — network error", () => {
  it("wraps fetch rejection as NETWORK TamsError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const repo = createFlowsRepo({
      ...config,
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(repo.listForSource("any-id")).rejects.toMatchObject({
      code: "NETWORK",
    });
    await expect(repo.listForSource("any-id")).rejects.toBeInstanceOf(TamsError);
  });
});
