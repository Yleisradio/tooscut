import { useEffect, useRef } from "react";

import { useVideoEditorStore } from "../../../state/video-editor-store";
import { useTamsClient } from "../../../state/use-tams-client";
import { useAssetStore } from "../../timeline/use-asset-store";
import { tamsUrlCache } from "./tams-url-cache";

/**
 * When the TAMS client first becomes available, re-fetch presigned GET URLs for
 * all TAMS assets currently in the editor. Runs once per client instance — does
 * NOT re-run on every asset-list change to avoid an infinite fetch loop.
 */
export function useTamsHydration() {
  const client = useTamsClient();
  const hydratedRef = useRef(new Set<string>());

  useEffect(() => {
    if (!client) return;

    // Snapshot assets at effect time — not a reactive dependency
    const tamsAssets = useVideoEditorStore
      .getState()
      .assets.filter((a) => a.tamsFlowId && a.tamsSourceId);

    if (tamsAssets.length === 0) return;

    const updateAssetUrl = useVideoEditorStore.getState().updateAssetUrl;
    const patchAsset = useAssetStore.getState().patchAsset;
    const alreadyHydrated = hydratedRef.current;

    for (const asset of tamsAssets) {
      if (alreadyHydrated.has(asset.id)) continue;
      alreadyHydrated.add(asset.id);

      void (async () => {
        try {
          const segments = await client.flows.getSegments(asset.tamsFlowId!, { limit: 1 });
          const freshUrl = segments[0]?.get_urls?.[0]?.url;
          if (!freshUrl) return;
          tamsUrlCache.set(asset.id, freshUrl);
          updateAssetUrl(asset.id, freshUrl);
          patchAsset(asset.id, { url: freshUrl });
        } catch {
          alreadyHydrated.delete(asset.id);
        }
      })();
    }
  }, [client]); // only re-run when the client instance changes
}
