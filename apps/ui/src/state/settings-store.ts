import { create } from "zustand";

import { db } from "./db";

interface SettingsState {
  tamsApiUrl: string;
  tamsUsername: string;
  tamsPassword: string;
  isLoaded: boolean;
  setTamsApiUrl: (url: string) => Promise<void>;
  setTamsCredentials: (url: string, username: string, password: string) => Promise<void>;
  clearTamsCredentials: () => Promise<void>;
  loadFromDb: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>()((set) => ({
  tamsApiUrl: "",
  tamsUsername: "",
  tamsPassword: "",
  isLoaded: false,

  loadFromDb: async () => {
    const envUrl = import.meta.env["VITE_TAMS_API_URL"] as string | undefined;
    const [urlRecord, usernameRecord, passwordRecord] = await Promise.all([
      db.settings.get("tamsApiUrl"),
      db.settings.get("tamsUsername"),
      db.settings.get("tamsPassword"),
    ]);
    set({
      tamsApiUrl: urlRecord?.value ?? envUrl ?? "",
      tamsUsername: usernameRecord?.value ?? "",
      tamsPassword: passwordRecord?.value ?? "",
      isLoaded: true,
    });
  },

  setTamsApiUrl: async (url: string) => {
    await db.settings.put({ key: "tamsApiUrl", value: url });
    set({ tamsApiUrl: url });
  },

  setTamsCredentials: async (url: string, username: string, password: string) => {
    await Promise.all([
      db.settings.put({ key: "tamsApiUrl", value: url }),
      db.settings.put({ key: "tamsUsername", value: username }),
      db.settings.put({ key: "tamsPassword", value: password }),
    ]);
    set({ tamsApiUrl: url, tamsUsername: username, tamsPassword: password });
  },

  clearTamsCredentials: async () => {
    await Promise.all([
      db.settings.delete("tamsUsername"),
      db.settings.delete("tamsPassword"),
    ]);
    set({ tamsUsername: "", tamsPassword: "" });
  },
}));
