import { createTamsClient } from "@tooscut/tams-client";
import { create } from "zustand";

import { useSettingsStore } from "./settings-store";

interface TamsAuthState {
  username: string;
  password: string;
  isAuthenticated: boolean;
  isLoggingIn: boolean;
  loginError: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
}

export const useTamsAuthStore = create<TamsAuthState>()((set) => ({
  username: "",
  password: "",
  isAuthenticated: false,
  isLoggingIn: false,
  loginError: null,

  login: async (username: string, password: string) => {
    const { tamsApiUrl, setTamsCredentials } = useSettingsStore.getState();
    set({ isLoggingIn: true, loginError: null });
    try {
      const client = createTamsClient({ baseUrl: tamsApiUrl, username, password });
      await client.sources.list({ limit: 1 });
      await setTamsCredentials(tamsApiUrl, username, password);
      set({ username, password, isAuthenticated: true, isLoggingIn: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      set({ isLoggingIn: false, loginError: message });
    }
  },

  logout: () => {
    void useSettingsStore.getState().clearTamsCredentials();
    set({ username: "", password: "", isAuthenticated: false, loginError: null });
  },

  restoreSession: async () => {
    const { tamsApiUrl, tamsUsername, tamsPassword } = useSettingsStore.getState();
    if (!tamsApiUrl || !tamsUsername || !tamsPassword) return;
    set({ isLoggingIn: true });
    try {
      const client = createTamsClient({ baseUrl: tamsApiUrl, username: tamsUsername, password: tamsPassword });
      await client.sources.list({ limit: 1 });
      set({ username: tamsUsername, password: tamsPassword, isAuthenticated: true, isLoggingIn: false });
    } catch {
      // Silently fail — saved credentials may be stale; user can log in manually
      set({ isLoggingIn: false });
    }
  },
}));
