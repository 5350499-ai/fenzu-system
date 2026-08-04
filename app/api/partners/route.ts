import { NextResponse } from "next/server";
import { apiErrorResponse, parseJson, requireActiveAccount, writeAuditLog, AccountApiError } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

function cleanName(value: unknown) {
  const name = String(value || "").trim();
  if (!name) throw new AccountApiError("合伙人名称不能为空", 400);
  if (name.length > 80) throw new AccountApiError("合伙人名称不能超过80个字符", 400);
  return name;
}

export async function GET(request: Request) {
  try {
    const context = await requireActiveAccount(request);
    const admin = getSupabaseAdmin();
    const workspaceOwnerId = context.profile.workspace_owner_id;
    const [partnersResult, sharesResult, propertiesResult] = await Promise.all([
      admin.from("partners").select("id,workspace_owner_id,legacy_code,display_name,color_key,sort_order,is_active,linked_account_id").eq("workspace_owner_id", workspaceOwnerId).order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
      admin.from("partner_property_shares").select("id,workspace_owner_id,property_id,partner_id,percentage,effective_from,effective_to").eq("workspace_owner_id", workspaceOwnerId).order("effective_from", { ascending: false }),
      admin.from("properties").select("id,name,address,city").eq("user_id", workspaceOwnerId).order("name", { ascending: true })
    ]);
    if (partnersResult.error || sharesResult.error || propertiesResult.error) throw new Error("加载合伙人资料失败");
    const shares = (sharesResult.data || []) as Array<Record<string, unknown>>;
    const currentPropertyCounts = new Map<string, Set<string>>();
    const futurePropertyCounts = new Map<string, Set<string>>();
    const today = new Date().toISOString().slice(0, 10);
    shares.forEach((share) => {
      const partnerId = String(share.partner_id);
      const target = String(share.effective_from) > today ? futurePropertyCounts : currentPropertyCounts;
      if (!target.has(partnerId)) target.set(partnerId, new Set());
      target.get(partnerId)!.add(String(share.property_id));
    });
    return NextResponse.json({
      partners: (partnersResult.data || []).map((partner) => ({
        id: partner.id,
        workspaceOwnerId: partner.workspace_owner_id,
        legacyCode: partner.legacy_code,
        displayName: partner.display_name,
        colorKey: partner.color_key,
        sortOrder: partner.sort_order,
        isActive: partner.is_active,
        linkedAccountId: partner.linked_account_id,
        propertyCount: currentPropertyCounts.get(partner.id)?.size || 0,
        currentPropertyCount: currentPropertyCounts.get(partner.id)?.size || 0,
        futurePropertyCount: futurePropertyCounts.get(partner.id)?.size || 0
      })),
      shares: shares.map((share) => ({
        id: share.id,
        workspaceOwnerId: share.workspace_owner_id,
        propertyId: share.property_id,
        partnerId: share.partner_id,
        percentage: Number(share.percentage),
        effectiveFrom: share.effective_from,
        effectiveTo: share.effective_to
      })),
      properties: (propertiesResult.data || []).map((property) => ({ id: property.id, name: property.name, address: property.address, city: property.city }))
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireActiveAccount(request, true);
    const body = await parseJson(request) as Record<string, unknown>;
    const displayName = cleanName(body.displayName);
    const admin = getSupabaseAdmin();
    const workspaceOwnerId = context.profile.workspace_owner_id;
    const { count, error: countError } = await admin.from("partners").select("id", { count: "exact", head: true }).eq("workspace_owner_id", workspaceOwnerId).eq("is_active", true);
    if (countError) throw new Error("检查合伙人数失败");
    if ((count || 0) >= 10) throw new AccountApiError("启用合伙人最多10位", 400);
    const { data, error } = await admin.from("partners").insert({
      workspace_owner_id: workspaceOwnerId,
      display_name: displayName,
      color_key: body.colorKey ? String(body.colorKey).trim().slice(0, 40) : null,
      sort_order: Number.isInteger(body.sortOrder) ? Number(body.sortOrder) : (count || 0) + 1,
      is_active: true
    }).select("id").single();
    if (error) throw new Error(error.message);
    await writeAuditLog(context, { actionType: "create_partner", moduleKey: "settings", entityType: "partner", entityId: data.id, afterData: { displayName }, description: "创建动态合伙人" });
    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
