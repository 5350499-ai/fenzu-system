"use client";

import { getValidSupabaseSession } from "./supabase";

export type RentPaymentLifecycleAction = "void" | "delete";

export type RentPaymentLifecycleResult = {
  action: RentPaymentLifecycleAction;
  paymentId: string;
  linkedDepositId: string | null;
  linkedDepositHandled: boolean;
  legacyMixedDeposit: boolean;
  attachmentCleanupWarning?: string;
};

export async function applyRentPaymentLifecycle(paymentId: string, action: RentPaymentLifecycleAction) {
  const session = await getValidSupabaseSession();
  if (!session) throw new Error("请先登录。");
  const response = await fetch("/api/rent-payments/lifecycle", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`
    },
    body: JSON.stringify({ paymentId, action })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.result) throw new Error(payload?.error || "收款生命周期操作失败，请稍后重试。");
  return { ...payload.result, attachmentCleanupWarning: payload.attachmentCleanupWarning } as RentPaymentLifecycleResult;
}
