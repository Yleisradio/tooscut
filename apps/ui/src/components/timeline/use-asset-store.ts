import { create } from "zustand";

import { db, type TamsAssetRecord } from "../../state/db";
import {
  useVideoEditorStore,
  type MediaAsset as StoreMediaAsset,
} from "../../state/video-editor-store";

// ============================================================================
// MediaAsset discriminated union
// ============================================================================

interface MediaAssetBase {
  id: string;
  type: "video" | "audio" | "image" | "lut";
  name: string;
  /** Object URL (local) or presigned GET URL (TAMS) for playback/preview */
  url: string;
  /** Duration in seconds (0 for images) */
  duration: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

export type LocalMediaAsset = MediaAssetBase & {
  source: "local";
  /** Original file reference */
  file: File;
  /** File size in bytes */
  size: number;
};

export type TamsMediaAsset = MediaAssetBase & {
  source: "tams";
  tamsSourceId: string;
  tamsFlowId: string;
  segmentTimerange: string;
};

export type MediaAsset = LocalMediaAsset | TamsMediaAsset;

// ============================================================================
// Store
// ============================================================================

interface AssetState {
  assets: MediaAsset[];
  isLoading: boolean;
  error: string | null;

  addAsset: (asset: MediaAsset) => void;
  addAssets: (assets: MediaAsset[]) => void;
  patchAsset: (id: string, patch: Partial<MediaAsset>) => void;
  removeAsset: (id: string) => void;
  clearAssets: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useAssetStore = create<AssetState>((set) => ({
  assets: [],
  isLoading: false,
  error: null,

  addAsset: (asset) => set((state) => ({ assets: [...state.assets, asset] })),

  addAssets: (assets) => set((state) => ({ assets: [...state.assets, ...assets] })),

  patchAsset: (id, patch) =>
    set((state) => ({
      assets: state.assets.map((a) => (a.id === id ? ({ ...a, ...patch } as MediaAsset) : a)),
    })),

  removeAsset: (id) =>
    set((state) => {
      const asset = state.assets.find((a) => a.id === id);
      if (asset?.source === "local") {
        URL.revokeObjectURL(asset.url);
        if (asset.thumbnailUrl) URL.revokeObjectURL(asset.thumbnailUrl);
      }
      if (asset?.source === "tams") {
        void db.tamsAssets.delete(id);
      }
      return { assets: state.assets.filter((a) => a.id !== id) };
    }),

  clearAssets: () =>
    set((state) => {
      for (const asset of state.assets) {
        if (asset.source === "local") {
          URL.revokeObjectURL(asset.url);
          if (asset.thumbnailUrl) URL.revokeObjectURL(asset.thumbnailUrl);
        }
      }
      return { assets: [] };
    }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
}));

// ============================================================================
// File import utilities
// ============================================================================

function getAssetType(mimeType: string): "video" | "audio" | "image" | null {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("image/")) return "image";
  return null;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function getVideoMetadata(
  file: File,
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      resolve({
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
      });
      URL.revokeObjectURL(video.src);
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      reject(new Error("Failed to load video metadata"));
    };

    video.src = URL.createObjectURL(file);
  });
}

async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";

    audio.onloadedmetadata = () => {
      resolve(audio.duration);
      URL.revokeObjectURL(audio.src);
    };

    audio.onerror = () => {
      URL.revokeObjectURL(audio.src);
      reject(new Error("Failed to load audio metadata"));
    };

    audio.src = URL.createObjectURL(file);
  });
}

async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error("Failed to load image"));
    };

    img.src = URL.createObjectURL(file);
  });
}

async function generateThumbnail(file: File, type: "video" | "image"): Promise<string> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Failed to get canvas context");

  const dpr = typeof window !== "undefined" ? window.devicePixelRatio : 2;
  const thumbnailSize = Math.round(200 * dpr);

  if (type === "image") {
    const img = new Image();
    const url = URL.createObjectURL(file);

    return new Promise((resolve, reject) => {
      img.onload = () => {
        const scale = Math.min(thumbnailSize / img.width, thumbnailSize / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to load image for thumbnail"));
      };
      img.src = url;
    });
  }

  const video = document.createElement("video");
  video.preload = "auto";
  video.muted = true;
  video.playsInline = true;
  const url = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };

    video.onseeked = async () => {
      try {
        if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
          await new Promise<void>((r) => {
            video.addEventListener("canplay", () => r(), { once: true });
          });
        }
        const displayW = video.videoWidth;
        const displayH = video.videoHeight;
        const scale = Math.min(thumbnailSize / displayW, thumbnailSize / displayH);
        canvas.width = Math.round(displayW * scale);
        canvas.height = Math.round(displayH * scale);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err instanceof Error ? err : new Error("Failed to generate thumbnail"));
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load video for thumbnail"));
    };

    video.src = url;
  });
}

export async function importFiles(
  files: FileList | File[],
  fileHandles?: FileSystemFileHandle[],
): Promise<LocalMediaAsset[]> {
  const assets: LocalMediaAsset[] = [];
  const fileArray = Array.from(files);

  const existingAssets = useAssetStore.getState().assets;
  const existingKeys = new Set(
    existingAssets
      .filter((a): a is LocalMediaAsset => a.source === "local")
      .map((a) => `${a.name}|${a.size}|${a.type}`),
  );

  for (let i = 0; i < fileArray.length; i++) {
    const file = fileArray[i];
    const type = getAssetType(file.type);
    if (!type) {
      console.warn(`Unsupported file type: ${file.type}`);
      continue;
    }

    const dedupeKey = `${file.name}|${file.size}|${type}`;
    if (existingKeys.has(dedupeKey)) continue;
    existingKeys.add(dedupeKey);

    try {
      const id = generateId();
      const url = URL.createObjectURL(file);

      let duration = 0;
      let width: number | undefined;
      let height: number | undefined;
      let thumbnailUrl: string | undefined;

      if (type === "video") {
        const meta = await getVideoMetadata(file);
        duration = meta.duration;
        width = meta.width;
        height = meta.height;
        thumbnailUrl = await generateThumbnail(file, "video");
      } else if (type === "audio") {
        duration = await getAudioDuration(file);
      } else if (type === "image") {
        const dims = await getImageDimensions(file);
        width = dims.width;
        height = dims.height;
        duration = 10;
        thumbnailUrl = await generateThumbnail(file, "image");
      }

      const handle = fileHandles?.[i];
      if (handle) {
        await db.fileHandles.put({
          id,
          handle,
          fileName: file.name,
          mimeType: file.type,
          size: file.size,
          storedAt: Date.now(),
        });
      }

      assets.push({
        id,
        source: "local",
        type,
        name: file.name,
        url,
        duration,
        size: file.size,
        file,
        width,
        height,
        thumbnailUrl,
      });
    } catch (error) {
      console.error(`Failed to import ${file.name}:`, error);
    }
  }

  return assets;
}

const ACCEPT_MAP: Record<string, string[]> = {
  "video/*": [".mp4", ".webm", ".mov", ".avi", ".mkv"],
  "audio/*": [".mp3", ".wav", ".ogg", ".aac", ".flac"],
  "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"],
};

export async function importFilesWithPicker(
  accept = "video/*,audio/*,image/*",
): Promise<LocalMediaAsset[]> {
  const picker = (
    window as unknown as {
      showOpenFilePicker?: (options: Record<string, unknown>) => Promise<FileSystemFileHandle[]>;
    }
  ).showOpenFilePicker;

  if (!picker) {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.accept = accept;
      input.onchange = async () => {
        if (input.files && input.files.length > 0) {
          resolve(await importFiles(input.files));
        } else {
          resolve([]);
        }
      };
      input.click();
    });
  }

  const acceptEntries: Record<string, string[]> = {};
  for (const part of accept.split(",")) {
    const key = part.trim();
    if (ACCEPT_MAP[key]) {
      acceptEntries[key] = ACCEPT_MAP[key];
    }
  }

  try {
    const handles = await picker({
      multiple: true,
      types: [{ description: "Media files", accept: acceptEntries }],
    });

    const files = await Promise.all(handles.map((h: FileSystemFileHandle) => h.getFile()));
    return importFiles(files, handles);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") return [];
    throw err;
  }
}

// ============================================================================
// Hydration (file handle → blob URL restoration)
// ============================================================================

interface HydratedAsset extends StoreMediaAsset {
  source: "local";
  file: File;
  size: number;
}

export async function hydrateAssets(assets: StoreMediaAsset[]): Promise<{
  hydrated: HydratedAsset[];
  pendingIds: string[];
  failedIds: string[];
}> {
  const hydrated: HydratedAsset[] = [];
  const pendingIds: string[] = [];
  const failedIds: string[] = [];

  for (const asset of assets) {
    // Remote-URL assets (TAMS) and non-empty URLs don't need file handle hydration
    if (asset.url !== "") continue;
    if (asset.type === "lut") continue;

    try {
      const stored = await db.fileHandles.get(asset.id);
      if (!stored) {
        failedIds.push(asset.id);
        continue;
      }

      const handle = stored.handle as FileSystemFileHandle & {
        queryPermission: (opts: { mode: string }) => Promise<string>;
      };
      const permission: string = await handle.queryPermission({ mode: "read" });

      if (permission === "granted") {
        const file = await stored.handle.getFile();
        const url = URL.createObjectURL(file);
        hydrated.push({ ...asset, source: "local", url, file, size: file.size });
      } else if (permission === "prompt") {
        pendingIds.push(asset.id);
      } else {
        failedIds.push(asset.id);
      }
    } catch (err) {
      console.error(`[hydrate] asset ${asset.id}: error`, err);
      failedIds.push(asset.id);
    }
  }

  return { hydrated, pendingIds, failedIds };
}

export async function requestPermissionAndHydrate(
  assetIds: string[],
  allAssets: StoreMediaAsset[],
): Promise<HydratedAsset[]> {
  const hydrated: HydratedAsset[] = [];

  for (const assetId of assetIds) {
    const asset = allAssets.find((a) => a.id === assetId);
    if (!asset) continue;

    try {
      const stored = await db.fileHandles.get(assetId);
      if (!stored) continue;

      const handle = stored.handle as FileSystemFileHandle & {
        requestPermission: (opts: { mode: string }) => Promise<string>;
      };
      const result: string = await handle.requestPermission({ mode: "read" });

      if (result === "granted") {
        const file = await stored.handle.getFile();
        const url = URL.createObjectURL(file);
        hydrated.push({ ...asset, source: "local", url, file, size: file.size });
      }
    } catch (err) {
      console.error(`[permission] asset ${assetId}: error`, err);
    }
  }

  return hydrated;
}

// ============================================================================
// Native file drop
// ============================================================================

export function handleNativeFileDrop(
  e: DragEvent,
  onDrop: (files: FileList, handles?: FileSystemFileHandle[]) => void,
) {
  if (!e.dataTransfer || e.dataTransfer.files.length === 0) return;

  const files = e.dataTransfer.files;
  const items = e.dataTransfer.items;

  if (items.length > 0 && "getAsFileSystemHandle" in DataTransferItem.prototype) {
    const handlePromises = Array.from(items)
      .filter((item) => item.kind === "file")
      .map((item) =>
        (
          item as unknown as {
            getAsFileSystemHandle(): Promise<FileSystemHandle>;
          }
        ).getAsFileSystemHandle(),
      );

    void Promise.all(handlePromises)
      .then((results) => {
        const handles = results.filter(
          (h): h is FileSystemFileHandle => h != null && h.kind === "file",
        );
        onDrop(files, handles.length > 0 ? handles : undefined);
      })
      .catch(() => {
        onDrop(files);
      });
  } else {
    onDrop(files);
  }
}

// ============================================================================
// Store sync helpers
// ============================================================================

export function addAssetsToStores(imported: LocalMediaAsset[]) {
  useAssetStore.getState().addAssets(imported);
  const projectFps = useVideoEditorStore.getState().settings.fps;
  const editorAssets: StoreMediaAsset[] = imported.map((a) => ({
    id: a.id,
    type: a.type,
    name: a.name,
    url: a.url,
    duration:
      a.type === "image"
        ? 0
        : Math.round((a.duration * projectFps.numerator) / projectFps.denominator),
    width: a.width,
    height: a.height,
    thumbnailUrl: a.thumbnailUrl,
  }));
  useVideoEditorStore.getState().addAssets(editorAssets);
}

/**
 * Add a TAMS asset to both the UI store and the editor store.
 * Deduplicates by flowId + segmentTimerange — returns the effective asset ID.
 */
export function addTamsAssetToStores(ui: TamsMediaAsset, store: StoreMediaAsset): string {
  const existing = useAssetStore
    .getState()
    .assets.find(
      (a): a is TamsMediaAsset =>
        a.source === "tams" &&
        a.tamsFlowId === ui.tamsFlowId &&
        a.segmentTimerange === ui.segmentTimerange,
    );
  if (existing) return existing.id;

  useAssetStore.getState().addAsset(ui);
  useVideoEditorStore.getState().addAssets([store]);

  const record: TamsAssetRecord = {
    id: ui.id,
    sourceId: ui.tamsSourceId,
    flowId: ui.tamsFlowId,
    segmentTimerange: ui.segmentTimerange,
    label: ui.name,
    format: ui.type,
    storedAt: Date.now(),
  };
  void db.tamsAssets.put(record);

  return ui.id;
}

// ============================================================================
// Format helpers
// ============================================================================

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
