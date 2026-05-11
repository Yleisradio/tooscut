import { z } from "zod";
import { request } from "./http.js";
import { SourceInputSchema, SourceSchema } from "./schemas.js";
import type { ListSourcesQuery, Source, SourceInput, TamsClientConfig } from "./types.js";

export type SourcesRepository = {
  list: (query?: ListSourcesQuery) => Promise<Source[]>;
  findById: (sourceId: string) => Promise<Source>;
  create: (input: SourceInput) => Promise<Source>;
  setLabel: (sourceId: string, label: string) => Promise<void>;
};

export function createSourcesRepo(config: TamsClientConfig): SourcesRepository {
  return {
    list(query) {
      return request(config, z.array(SourceSchema), "GET", "sources", {
        query: query as Record<string, string | number | boolean | undefined>,
      });
    },

    findById(sourceId) {
      return request(config, SourceSchema, "GET", `sources/${sourceId}`);
    },

    create(input) {
      const validated = SourceInputSchema.parse(input);
      const id = validated.id ?? crypto.randomUUID();
      return request(config, SourceSchema, "PUT", `sources/${id}`, { body: { ...validated, id } });
    },

    async setLabel(sourceId, label) {
      await request(config, z.unknown(), "PUT", `sources/${sourceId}/label`, { body: label });
    },
  };
}
