import { beforeEach, describe, expect, it, vi } from "vitest";
import { TamsError } from "../src/errors.js";
import { createSourcesRepo } from "../src/sources-repo.js";
import type { TamsClientConfig } from "../src/types.js";
import sourceFixture from "./fixtures/source.json";

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
  fetchImpl: mockFetch(200, [sourceFixture]),
};

describe("SourcesRepository.list", () => {
  it("calls GET /sources with correct auth header", async () => {
    const fetchMock = mockFetch(200, [sourceFixture]);
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    const sources = await repo.list();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://localhost:3000/sources");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      `Basic ${btoa("admin:admin")}`,
    );
    expect(sources).toHaveLength(1);
    expect(sources[0].id).toBe(sourceFixture.id);
  });

  it("appends query params when provided", async () => {
    const fetchMock = mockFetch(200, [sourceFixture]);
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    await repo.list({ label: "my source", limit: 10 });

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toContain("label=my+source");
    expect(url).toContain("limit=10");
  });

  it("throws TamsError with code AUTH on 401", async () => {
    const fetchMock = mockFetch(401, { error: "Unauthorized" });
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    await expect(repo.list()).rejects.toThrow(TamsError);
    await expect(repo.list()).rejects.toMatchObject({ code: "AUTH", statusCode: 401 });
  });

  it("throws TamsError with code SERVER_ERROR on 500", async () => {
    const fetchMock = mockFetch(500, { error: "Internal error" });
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    await expect(repo.list()).rejects.toMatchObject({ code: "SERVER_ERROR" });
  });
});

describe("SourcesRepository.findById", () => {
  it("calls GET /sources/:id", async () => {
    const fetchMock = mockFetch(200, sourceFixture);
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    const source = await repo.findById("00000000-0000-0000-0000-000000000001");

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe("http://localhost:3000/sources/00000000-0000-0000-0000-000000000001");
    expect(source.label).toBe("Test Source");
  });

  it("throws TamsError NOT_FOUND on 404", async () => {
    const fetchMock = mockFetch(404, { error: "Not found" });
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    await expect(repo.findById("missing-id")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("SourcesRepository.create", () => {
  it("calls PUT /sources/:id with JSON body and returns created source", async () => {
    const fetchMock = mockFetch(200, sourceFixture);
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    const source = await repo.create({
      id: "00000000-0000-0000-0000-000000000001",
      format: "urn:x-nmos:format:video",
      label: "Test Source",
    });

    const [url, init] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(url).toBe("http://localhost:3000/sources/00000000-0000-0000-0000-000000000001");
    expect(init.method).toBe("PUT");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(source.id).toBe(sourceFixture.id);
  });

  it("generates a UUID when no id is provided", async () => {
    const fetchMock = mockFetch(200, sourceFixture);
    const repo = createSourcesRepo({ ...config, fetchImpl: fetchMock });

    await repo.create({ format: "urn:x-nmos:format:audio" });

    const [url] = (fetchMock as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    // URL should contain a generated UUID, not the fixture ID
    expect(url).toMatch(/sources\/[0-9a-f-]{36}$/);
  });
});

describe("TamsError", () => {
  it("has correct name and code", () => {
    const err = new TamsError("NETWORK", "Connection refused");
    expect(err.name).toBe("TamsError");
    expect(err.code).toBe("NETWORK");
    expect(err.message).toBe("Connection refused");
  });

  it("does not expose credentials in the message", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Connection refused"));
    const repo = createSourcesRepo({
      ...config,
      username: "secret-user",
      password: "secret-pass",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    try {
      await repo.list();
    } catch (err) {
      expect(err).toBeInstanceOf(TamsError);
      expect((err as TamsError).message).not.toContain("secret-user");
      expect((err as TamsError).message).not.toContain("secret-pass");
    }
  });
});
