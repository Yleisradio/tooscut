import { create } from "zustand";

type LiveMonitorStore = {
  flowId: string | null;
  sourceId: string | null;
  startMonitoring: (flowId: string, sourceId: string) => void;
  stopMonitoring: () => void;
};

export const useLiveMonitorStore = create<LiveMonitorStore>((set) => ({
  flowId: null,
  sourceId: null,
  startMonitoring: (flowId, sourceId) => set({ flowId, sourceId }),
  stopMonitoring: () => set({ flowId: null, sourceId: null }),
}));
