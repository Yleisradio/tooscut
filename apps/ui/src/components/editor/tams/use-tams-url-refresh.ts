import { useEffect } from "react";

import { useVideoEditorStore } from "../../../state/video-editor-store";
import { useTamsClient } from "../../../state/use-tams-client";
import { useAssetStore, type TamsMediaAsset } from "../../timeline/use-asset-store";
import { tamsUrlCache } from "./tams-url-cache";

const SWEEP_INTERVAL_MS = 60_000;

export function useTamsUrlRefresh() {
  const client = useTamsClient();

  useEffect(() => {
    if (!client) return;

    const sweep = async () => {
      const assets = useAssetStore
        .getState()
        .assets.filter((a): a is TamsMediaAsset => a.source === "tams");

      for (const asset of assets) {
        // Skip live-captured clips — their url is a blob: containing a
        // pre-fetched init + media payload. Refreshing would swap that for a
        // single-segment presigned URL the rest of the pipeline can't decode.
        if (asset.url.startsWith("blob:")) continue;
        if (!tamsUrlCache.isNearExpiry(asset.id)) continue;

        try {
          const segments = await client.flows.getSegments(asset.tamsFlowId, { limit: 1 });
          const freshUrl = segments[0]?.get_urls?.[0]?.url;
          if (!freshUrl) continue;

          tamsUrlCache.set(asset.id, freshUrl);
          useVideoEditorStore.getState().updateAssetUrl(asset.id, freshUrl);
          useAssetStore.getState().patchAsset(asset.id, { url: freshUrl });
        } catch {
          // silent — will retry on next sweep
        }
      }
    };

    const id = setInterval(() => void sweep(), SWEEP_INTERVAL_MS);
    void sweep();
    return () => clearInterval(id);
  }, [client]);
}
