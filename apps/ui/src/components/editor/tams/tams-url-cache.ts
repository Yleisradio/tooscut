interface CacheEntry {
  url: string;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry>();

function parseExpiry(url: string): number {
  try {
    const u = new URL(url);
    const dateParam = u.searchParams.get("X-Amz-Date");
    const expiresParam = u.searchParams.get("X-Amz-Expires");
    if (dateParam && expiresParam) {
      // X-Amz-Date format: YYYYMMDDTHHMMSSZ
      const iso = `${dateParam.slice(0, 4)}-${dateParam.slice(4, 6)}-${dateParam.slice(6, 8)}T${dateParam.slice(9, 11)}:${dateParam.slice(11, 13)}:${dateParam.slice(13, 15)}Z`;
      const startMs = new Date(iso).getTime();
      if (Number.isFinite(startMs)) {
        return startMs + Number(expiresParam) * 1000;
      }
    }
  } catch {
    // ignore malformed URLs
  }
  return Date.now() + 60 * 60 * 1000;
}

export const tamsUrlCache = {
  set(assetId: string, url: string): void {
    _cache.set(assetId, { url, expiresAt: parseExpiry(url) });
  },

  get(assetId: string): string | null {
    return _cache.get(assetId)?.url ?? null;
  },

  isNearExpiry(assetId: string, thresholdMs = 5 * 60 * 1000): boolean {
    const entry = _cache.get(assetId);
    if (!entry) return true;
    return entry.expiresAt - Date.now() < thresholdMs;
  },

  invalidate(assetId: string): void {
    _cache.delete(assetId);
  },

  clear(): void {
    _cache.clear();
  },
};
