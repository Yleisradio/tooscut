import { z } from "zod";
import { TamsError } from "./errors.js";
import type { TamsClientConfig } from "./types.js";

type QueryParams = Record<string, string | number | boolean | undefined>;

function buildAuthHeader(username: string, password: string): string {
  return `Basic ${btoa(`${username}:${password}`)}`;
}

function buildUrl(baseUrl: string, path: string, query?: QueryParams): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return url.toString();
}

export async function request<T>(
  config: TamsClientConfig,
  schema: z.ZodSchema<T>,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  options?: { body?: unknown; query?: QueryParams },
): Promise<T> {
  const fetchFn = config.fetchImpl ?? fetch;
  const url = buildUrl(config.baseUrl, path, options?.query);

  const headers: Record<string, string> = {
    Authorization: buildAuthHeader(config.username, config.password),
    Accept: "application/json",
  };

  if (options?.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetchFn(url, {
      method,
      headers,
      body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (err) {
    throw new TamsError("NETWORK", `Network error reaching ${url}`, err);
  }

  if (response.status === 401 || response.status === 403) {
    throw new TamsError("AUTH", "Authentication failed", undefined, response.status);
  }

  if (response.status === 404) {
    throw new TamsError("NOT_FOUND", `Resource not found: ${path}`, undefined, 404);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    throw new TamsError(
      "SERVER_ERROR",
      `HTTP ${response.status}: ${body}`,
      undefined,
      response.status,
    );
  }

  let text: string;
  try {
    text = await response.text();
  } catch (err) {
    throw new TamsError("NETWORK", "Failed to read response body", err);
  }

  if (!text) {
    return schema.parse(undefined);
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (err) {
    throw new TamsError("NETWORK", "Failed to parse response JSON", err);
  }

  const result = schema.safeParse(json);
  if (!result.success) {
    throw new TamsError(
      "VALIDATION",
      `Response validation failed: ${result.error.message}`,
      result.error,
    );
  }

  return result.data;
}
