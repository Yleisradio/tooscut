import { createTamsClient, type TamsClient } from "@tooscut/tams-client";
import { useMemo } from "react";

import { useSettingsStore } from "./settings-store";
import { useTamsAuthStore } from "./tams-auth-store";

export function useTamsClient(): TamsClient | null {
  const tamsApiUrl = useSettingsStore((s) => s.tamsApiUrl);
  const username = useTamsAuthStore((s) => s.username);
  const password = useTamsAuthStore((s) => s.password);
  const isAuthenticated = useTamsAuthStore((s) => s.isAuthenticated);

  return useMemo(() => {
    if (!isAuthenticated || !tamsApiUrl) return null;
    return createTamsClient({ baseUrl: tamsApiUrl, username, password });
  }, [isAuthenticated, tamsApiUrl, username, password]);
}
