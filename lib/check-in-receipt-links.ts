import { getValidSupabaseSession } from "./supabase";

export type CheckInReceiptLink = {
  paymentId: string;
  depositId: string;
};

export async function loadCheckInReceiptLinks(accessToken?: string): Promise<CheckInReceiptLink[]> {
  const token = accessToken || (await getValidSupabaseSession())?.access_token;
  if (!token) throw new Error("登录已失效，请重新登录。");
  const response = await fetch("/api/check-in/receipt-links", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  const payload = await response.json().catch(() => ({})) as { links?: CheckInReceiptLink[]; error?: string };
  if (!response.ok) throw new Error(payload.error || "读取一键入住收款关系失败，请稍后重试。");
  return Array.isArray(payload.links) ? payload.links : [];
}
