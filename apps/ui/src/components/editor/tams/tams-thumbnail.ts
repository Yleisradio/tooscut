const THUMBNAIL_SIZE = 200;

/**
 * Extract a thumbnail frame from a presigned TAMS URL via a hidden <video> seek.
 * Returns a data URL on success, or null on CORS block, codec error, or timeout.
 */
export async function generateTamsThumbnail(url: string): Promise<string | null> {
  if (!url) return null;

  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";
    video.crossOrigin = "anonymous";

    const cleanup = () => {
      video.src = "";
      video.load();
    };

    const capture = () => {
      try {
        const w = video.videoWidth;
        const h = video.videoHeight;
        if (!w || !h) {
          cleanup();
          resolve(null);
          return;
        }
        const dpr = window.devicePixelRatio ?? 1;
        const size = Math.round(THUMBNAIL_SIZE * dpr);
        const scale = Math.min(size / w, size / h);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        cleanup();
        resolve(canvas.toDataURL("image/jpeg", 0.8));
      } catch {
        cleanup();
        resolve(null);
      }
    };

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(1, video.duration / 2);
    };

    video.onseeked = capture;

    video.onerror = () => {
      cleanup();
      resolve(null);
    };

    // Timeout fallback — presigned URL may be blocked or slow
    const timer = setTimeout(() => {
      cleanup();
      resolve(null);
    }, 8000);

    video.addEventListener("seeked", () => clearTimeout(timer), { once: true });

    video.src = url;
  });
}
