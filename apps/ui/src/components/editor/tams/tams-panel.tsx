import type { Source } from "@tooscut/tams-client";
import { TamsError } from "@tooscut/tams-client";
import { AlertCircleIcon, LogOutIcon, PlugIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useSettingsStore } from "../../../state/settings-store";
import { useTamsAuthStore } from "../../../state/tams-auth-store";
import { useTamsClient } from "../../../state/use-tams-client";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { TamsLoginDialog } from "./tams-login-dialog";
import { TamsSourceRow } from "./tams-source-row";

export function TamsPanel() {
  const isAuthenticated = useTamsAuthStore((s) => s.isAuthenticated);
  const isLoggingIn = useTamsAuthStore((s) => s.isLoggingIn);
  const logout = useTamsAuthStore((s) => s.logout);
  const isLoaded = useSettingsStore((s) => s.isLoaded);
  const client = useTamsClient();

  const [loginOpen, setLoginOpen] = useState(false);
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSources = useCallback(
    async (label?: string) => {
      if (!client) return;
      setLoading(true);
      setError(null);
      try {
        const result = await client.sources.list(label ? { label } : undefined);
        const sorted = [...result].sort((a, b) => {
          const ta = a.created ? new Date(a.created).getTime() : 0;
          const tb = b.created ? new Date(b.created).getTime() : 0;
          return tb - ta;
        });
        setSources(sorted);
      } catch (err) {
        if (err instanceof TamsError && err.code === "AUTH") {
          useTamsAuthStore.getState().logout();
          setLoginOpen(true);
        }
        setError(err instanceof Error ? err.message : "Failed to load sources");
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  // Load sources on mount and when client changes
  useEffect(() => {
    if (isAuthenticated && client) void fetchSources();
  }, [isAuthenticated, client, fetchSources]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void fetchSources(search || undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, fetchSources]);

  if (!isLoaded || isLoggingIn) {
    return <div className="p-4 text-xs text-muted-foreground">Connecting…</div>;
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center gap-3 p-4">
        <p className="text-xs text-muted-foreground">Sign in to browse TAMS sources.</p>
        <Button size="sm" onClick={() => setLoginOpen(true)}>
          Connect to TAMS
        </Button>
        <TamsLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-6 text-xs"
            placeholder="Search sources…"
            size="sm"
            type="search"
            value={search}
            onChange={(e) => setSearch((e.target as HTMLInputElement).value)}
          />
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          title="Refresh"
          onClick={() => void fetchSources(search || undefined)}
        >
          <RefreshCwIcon className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          title="Change connection"
          onClick={() => setLoginOpen(true)}
        >
          <PlugIcon className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-7 shrink-0"
          title="Disconnect"
          onClick={logout}
        >
          <LogOutIcon className="size-3.5" />
        </Button>
      </div>
      <TamsLoginDialog open={loginOpen} onOpenChange={setLoginOpen} />

      {/* Source list */}
      <div className="flex-1 overflow-auto">
        {loading && sources.length === 0 && (
          <p className="p-4 text-xs text-muted-foreground">Loading sources…</p>
        )}
        {error && (
          <p className="flex items-center gap-1.5 p-4 text-xs text-destructive">
            <AlertCircleIcon className="size-3.5 shrink-0" />
            {error}
          </p>
        )}
        {!loading && !error && sources.length === 0 && (
          <p className="p-4 text-xs text-muted-foreground">No sources found.</p>
        )}
        {sources.map((source) => (
          <TamsSourceRow key={source.id} source={source} client={client!} />
        ))}
      </div>
    </div>
  );
}
