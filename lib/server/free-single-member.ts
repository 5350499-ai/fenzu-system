import "server-only";

import type { AccountRequestContext } from "@/lib/server/account-auth";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

export type FreeSingleMember = { id: string; displayName: string; legacyCode: string | null };

/**
 * Free accounts use the same partner tables as shared workspaces.  This keeps
 * financial attribution stable today and makes a future upgrade additive.
 */
export async function ensureFreeSingleMember(context: AccountRequestContext): Promise<FreeSingleMember> {
  const admin = getSupabaseAdmin();
  const ownerId = context.profile.workspace_owner_id;
  const { data: existing, error: existingError } = await admin
    .from("partners")
    .select("id,display_name,legacy_code")
    .eq("workspace_owner_id", ownerId)
    .eq("linked_account_id", context.userId)
    .maybeSingle();
  if (existingError) throw new Error("读取本人成员失败。");

  let member = existing ? { id: existing.id, displayName: existing.display_name, legacyCode: existing.legacy_code } : null;
  if (!member) {
    const { data, error } = await admin
      .from("partners")
      .insert({
        workspace_owner_id: ownerId,
        display_name: context.profile.display_name || "本人",
        color_key: "blue",
        sort_order: 0,
        is_active: true,
        linked_account_id: context.userId
      })
      .select("id,display_name,legacy_code")
      .single();
    if (error) {
      // Concurrent first requests may create the same row; read the winner.
      const { data: winner, error: winnerError } = await admin
        .from("partners")
        .select("id,display_name,legacy_code")
        .eq("workspace_owner_id", ownerId)
        .eq("linked_account_id", context.userId)
        .maybeSingle();
      if (winnerError || !winner) throw new Error("创建本人成员失败。");
      member = { id: winner.id, displayName: winner.display_name, legacyCode: winner.legacy_code };
    } else {
      member = { id: data.id, displayName: data.display_name, legacyCode: data.legacy_code };
    }
  }

  const { data: properties, error: propertyError } = await admin
    .from("properties")
    .select("id")
    .eq("user_id", ownerId);
  if (propertyError) throw new Error("读取房源比例失败。");
  for (const property of properties || []) {
    const { count, error: shareReadError } = await admin
      .from("partner_property_shares")
      .select("id", { count: "exact", head: true })
      .eq("workspace_owner_id", ownerId)
      .eq("property_id", property.id);
    if (shareReadError) throw new Error("读取房源比例失败。");
    if ((count || 0) === 0) {
      const { error: shareError } = await admin.from("partner_property_shares").insert({
        workspace_owner_id: ownerId,
        property_id: property.id,
        partner_id: member.id,
        percentage: 100,
        effective_from: "2000-01-01"
      });
      if (shareError) throw new Error("创建本人 100% 比例失败。");
    }
  }
  return member;
}

export function freeSingleAttribution(member: FreeSingleMember) {
  return member.id;
}
