"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { emptyModulePermissions, emptySensitivePermissions, type AccountModuleKey, type ModulePermission, type PermissionAction, type SensitivePermissionKey, type SensitivePermissions } from "@/lib/account-permissions";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AccountAccessValue = {
  ready: boolean;
  authenticated: boolean;
  isOwner: boolean;
  userId: string;
  workspaceOwnerId: string;
  propertyAccessMode: "all" | "selected";
  propertyIds: string[];
  modulePermissions: ModulePermission[];
  sensitivePermissions: SensitivePermissions;
  can: (moduleKey: AccountModuleKey, action?: PermissionAction) => boolean;
  canSensitive: (key: SensitivePermissionKey) => boolean;
  canAccessProperty: (propertyId?: string | null) => boolean;
  refresh: () => Promise<void>;
};

const defaultValue: AccountAccessValue = {
  ready: false,
  authenticated: false,
  isOwner: false,
  userId: "",
  workspaceOwnerId: "",
  propertyAccessMode: "selected",
  propertyIds: [],
  modulePermissions: emptyModulePermissions(),
  sensitivePermissions: emptySensitivePermissions(),
  can: () => false,
  canSensitive: () => false,
  canAccessProperty: () => false,
  refresh: async () => undefined
};

export const AccountAccessContext = createContext<AccountAccessValue>(defaultValue);

export function AccountAccessProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [state, setState] = useState<Omit<AccountAccessValue, "can" | "canSensitive" | "canAccessProperty" | "refresh">>(defaultValue);

  const load = useCallback(async () => {
    if (pathname === "/login") {
      setState((current) => ({ ...current, ready: true }));
      return;
    }
    if (!isSupabaseConfigured || !supabase) {
      setState((current) => ({ ...current, ready: true }));
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setState((current) => ({ ...current, ready: true, authenticated: false }));
      return;
    }
    const response = await fetch("/api/accounts/me", {
      cache: "no-store",
      headers: { Authorization: `Bearer ${data.session.access_token}` }
    });
    if (!response.ok) {
      setState((current) => ({ ...current, ready: true, authenticated: false }));
      return;
    }
    const payload = await response.json();
    setState({
      ready: true,
      authenticated: true,
      isOwner: Boolean(payload.isOwner),
      userId: payload.profile?.id || "",
      workspaceOwnerId: payload.profile?.workspaceOwnerId || "",
      propertyAccessMode: payload.profile?.propertyAccessMode === "all" ? "all" : "selected",
      propertyIds: Array.isArray(payload.propertyIds) ? payload.propertyIds : [],
      modulePermissions: Array.isArray(payload.modulePermissions) ? payload.modulePermissions : emptyModulePermissions(),
      sensitivePermissions: { ...emptySensitivePermissions(), ...(payload.sensitivePermissions || {}) }
    });
  }, [pathname]);

  useEffect(() => { load().catch(() => setState((current) => ({ ...current, ready: true }))); }, [load]);

  const value = useMemo<AccountAccessValue>(() => ({
    ...state,
    can: (moduleKey, action = "view") => {
      if (state.isOwner) return true;
      const permission = state.modulePermissions.find((item) => item.moduleKey === moduleKey);
      if (!permission) return false;
      return action === "view" ? permission.canView : action === "create" ? permission.canCreate : action === "edit" ? permission.canEdit : action === "archive" ? permission.canArchive : permission.canDelete;
    },
    canSensitive: (key) => state.isOwner || Boolean(state.sensitivePermissions[key]),
    canAccessProperty: (propertyId) => state.isOwner || state.propertyAccessMode === "all" || !propertyId || state.propertyIds.includes(propertyId),
    refresh: load
  }), [state, load]);

  return <AccountAccessContext.Provider value={value}>{children}</AccountAccessContext.Provider>;
}

export function useAccountAccess() {
  return useContext(AccountAccessContext);
}
