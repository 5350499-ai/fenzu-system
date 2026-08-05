export type DownloadMethod = "share" | "download";

export type DownloadResult = {
  method: DownloadMethod;
  shareAttempted: boolean;
  shareCancelled: boolean;
  fallbackReason?: "unsupported" | "not-shareable" | "cancelled" | "error";
};

export type DownloadOptions = {
  title?: string;
  preferShare?: boolean;
};

function isSharePreferredEnvironment() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  if (window.matchMedia?.("(pointer: coarse)").matches) return true;
  return navigator.maxTouchPoints > 0;
}

function downloadWithAnchor(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1500);
}

export async function downloadFile(file: File, options: DownloadOptions = {}): Promise<DownloadResult> {
  const preferShare = options.preferShare ?? isSharePreferredEnvironment();
  const canUseShare = preferShare
    && typeof navigator !== "undefined"
    && typeof navigator.canShare === "function"
    && typeof navigator.share === "function";

  if (canUseShare) {
    let shareCancelled = false;
    try {
      if (!navigator.canShare({ files: [file] })) {
        downloadWithAnchor(file);
        return { method: "download", shareAttempted: false, shareCancelled: false, fallbackReason: "not-shareable" };
      }
      try {
        await navigator.share({ files: [file], title: options.title || file.name });
        return { method: "share", shareAttempted: true, shareCancelled: false };
      } catch (error) {
        shareCancelled = error instanceof DOMException && error.name === "AbortError";
        downloadWithAnchor(file);
        return {
          method: "download",
          shareAttempted: true,
          shareCancelled,
          fallbackReason: shareCancelled ? "cancelled" : "error"
        };
      }
    } catch {
      downloadWithAnchor(file);
      return { method: "download", shareAttempted: true, shareCancelled, fallbackReason: "error" };
    }
  }

  downloadWithAnchor(file);
  return { method: "download", shareAttempted: false, shareCancelled: false, fallbackReason: canUseShare ? "error" : "unsupported" };
}
