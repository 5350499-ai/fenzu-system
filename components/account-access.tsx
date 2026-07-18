"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { emptyModulePermissions, emptySensitivePermissions, type AccountModuleKey, type ModulePermission, type PermissionAction, type SensitivePermissionKey, type SensitivePermissions } from "@/lib/account-permissions";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

type AccountAccessState = {
  ready: boolean;
  authenticated: boolean;
  isRefreshing: boolean;
  authState: "initializing" | "authenticated" | "unauthenticated" | "session_revoked" | "account_disabled" | "forbidden" | "network_error";
  invalidReason: string;
  isOwner: boolean;
  userId: string;
  profileUsername: string;
  profileDisplayName: string;
  workspaceOwnerId: string;
  propertyAccessMode: "all" | "selected";
  propertyIds: string[];
  modulePermissions: ModulePermission[];
  sensitivePermissions: SensitivePermissions;
};

type AccountAccessValue = AccountAccessState & {
  can: (moduleKey: AccountModuleKey, action?: PermissionAction) => boolean;
  canSensitive: (key: SensitivePermissionKey) => boolean;
  canAccessProperty: (propertyId?: string | null) => boolean;
  refresh: () => Promise<void>;
};

const emptyState = (): AccountAccessState => ({
  ready: false,
  authenticated: false,
  isRefreshing: false,
  authState: "initializing",
  invalidReason: "",
  isOwner: false,
  userId: "",
  profileUsername: "",
  profileDisplayName: "",
  workspaceOwnerId: "",
  propertyAccessMode: "selected",
  propertyIds: [],
  modulePermissions: emptyModulePermissions(),
  sensitivePermissions: emptySensitivePermissions()
});

const defaultValue: AccountAccessValue = {
  ...emptyState(),
  can: () => false,
  canSensitive: () => false,
  canAccessProperty: () => false,
  refresh: async () => undefined
};

let latestAccessState: AccountAccessState | null = null;
let accessRequest: Promise<AccountAccessState> | null = null;

async function resolveAccessState(): Promise<AccountAccessState> {
  if (!isSupabaseConfigured || !supabase) {
    return { ...emptyState(), ready: true, authState: "network_error", invalidReason: "系统尚未配置 Supabase 登录服务。" };
  }

  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) return { ...emptyState(), ready: true, authState: "unauthenticated" };

  const restoreResponse = await fetch("/api/auth/restore-session", {
    method: "POST",
    cache: "no-store",
    headers: { Authorization: `Bearer ${data.session.access_token}` }
  });
  const restorePayload = await restoreResponse.json().catch(() => ({}));
  if (!restoreResponse.ok) {
    const reason = typeof restorePayload.error === "string" ? restorePayload.error : "登录状态需要重新验证，请重新登录。";
    const authState = restoreResponse.status === 401
      ? "session_revoked"
      : restoreResponse.status === 403 && reason.includes("停用")
        ? "account_disabled"
        : restoreResponse.status === 403
          ? "forbidden"
          : "network_error";
    return {
      ...emptyState(),
      ready: true,
      authState,
      invalidReason: reason
    };
  }

  const response = await fetch("/api/accounts/me", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${data.session.access_token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const authState = response.status === 401
      ? "session_revoked"
      : response.status === 403 && typeof payload.error === "string" && payload.error.includes("停用")
        ? "account_disabled"
        : response.status === 403
          ? "forbidden"
          : "network_error";
    return {
      ...emptyState(),
      ready: true,
      authState,
      invalidReason: typeof payload.error === "string" ? payload.error : "账号权限已更新，请重新登录。"
    };
  }

  return {
    ready: true,
    authenticated: true,
    isRefreshing: false,
    authState: "authenticated",
    invalidReason: "",
    isOwner: Boolean(payload.isOwner),
    userId: payload.profile?.id || "",
    profileUsername: payload.profile?.username || "",
    profileDisplayName: payload.profile?.displayName || "",
    workspaceOwnerId: payload.profile?.workspaceOwnerId || "",
    propertyAccessMode: payload.profile?.propertyAccessMode === "all" ? "all" : "selected",
    propertyIds: Array.isArray(payload.propertyIds) ? payload.propertyIds : [],
    modulePermissions: Array.isArray(payload.modulePermissions) ? payload.modulePermissions : emptyModulePermissions(),
    sensitivePermissions: { ...emptySensitivePermissions(), ...(payload.sensitivePermissions || {}) }
  };
}

function loadAccessState() {
  if (!accessRequest) {
    accessRequest = resolveAccessState().finally(() => {
      accessRequest = null;
    });
  }
  return accessRequest;
}

export const AccountAccessContext = createContext<AccountAccessValue>(defaultValue);

export function AccountAccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccountAccessState>(() => latestAccessState || emptyState());
  const mountedRef = useRef(true);
  const bootstrappedRef = useRef(Boolean(latestAccessState?.ready));

  const refresh = useCallback(async (silent = false) => {
    const shouldKeepScreen = silent && bootstrappedRef.current;
    if (shouldKeepScreen) {
      setState((current) => ({ ...current, isRefreshing: true }));
    } else {
      setState((current) => ({ ...current, ready: false, isRefreshing: false, invalidReason: "" }));
    }

    try {
      const next = await loadAccessState();
      latestAccessState = next;
      bootstrappedRef.current = true;
      if (mountedRef.current) setState(next);
    } catch {
      // A transient background failure must not blank an already authorized page.
      if (mountedRef.current) {
        setState((current) => {
          if (shouldKeepScreen && current.authenticated) return { ...current, isRefreshing: false };
          return { ...emptyState(), ready: true, authState: "network_error", invalidReason: "无法校验账号状态，请检查网络后重新登录。" };
        });
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    refresh(Boolean(latestAccessState?.ready)).catch(() => undefined);

    if (!supabase) return () => { mountedRef.current = false; };

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        latestAccessState = null;
        bootstrappedRef.current = true;
        if (mountedRef.current) setState({ ...emptyState(), ready: true });
        return;
      }

      // Sign-in may legitimately show the initial bootstrap once. Token renewal
      // and focus checks keep the current page visible while permissions refresh.
      refresh(event === "SIGNED_IN" ? false : true).catch(() => undefined);
    });

    const handleFocus = () => {
      if (document.visibilityState === "visible") refresh(true).catch(() => undefined);
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleFocus);

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleFocus);
    };
  }, [refresh]);

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
    refresh: () => refresh(true)
  }), [refresh, state]);

  return <AccountAccessContext.Provider value={value}>{children}</AccountAccessContext.Provider>;
}

export function useAccountAccess() {
  return useContext(AccountAccessContext);
}
