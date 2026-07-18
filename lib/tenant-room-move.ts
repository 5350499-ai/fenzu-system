import { BusinessTenant } from "@/lib/business-data";
import { getValidSupabaseSession } from "@/lib/supabase";

export async function updateTenantCurrentAssignment(tenant: BusinessTenant) {
  let session = await getValidSupabaseSession();
  if (!session) throw new Error("登录状态已失效，请重新登录。");

  const submit = (accessToken: string) => fetch("/api/tenants/move-room", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      tenantId: tenant.id,
      propertyId: tenant.propertyId,
      roomId: tenant.roomId,
      name: tenant.name,
      phone: tenant.phone,
      wechat: tenant.wechat,
      source: tenant.source,
      monthlyRent: tenant.monthlyRent,
      depositAmount: tenant.depositAmount,
      paymentDay: tenant.paymentDay ?? null,
      status: tenant.status,
      notes: tenant.notes || ""
    })
  });

  let response = await submit(session.access_token);
  if (response.status === 401) {
    session = await getValidSupabaseSession(true);
    if (!session) throw new Error("登录状态已失效，请重新登录。");
    response = await submit(session.access_token);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "保存租客失败，请稍后重试。");
  return payload?.result;
}
