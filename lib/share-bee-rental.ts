export const BEE_RENTAL_SHARE_URL = "https://fenzu-system.vercel.app" as const;
export const BEE_RENTAL_SHARE_DATA = {
  title: "蜜蜂分租",
  text: "一个简单好用的分租房管理工具。",
  url: BEE_RENTAL_SHARE_URL
} as const;

export type ShareBeeRentalResult = "shared" | "copied" | "fallback";

export async function copyBeeRentalLink(): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(BEE_RENTAL_SHARE_URL);
    return true;
  } catch {
    return false;
  }
}

export async function shareBeeRental(): Promise<ShareBeeRentalResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(BEE_RENTAL_SHARE_DATA);
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "shared";
    }
  }
  return (await copyBeeRentalLink()) ? "copied" : "fallback";
}
