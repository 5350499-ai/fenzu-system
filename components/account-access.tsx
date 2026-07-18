"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { emptyModulePermissions, emptySensitivePermissions, type AccountModuleKey, type ModulePermission, type PermissionAction, type SensitivePermissionKey, type SensitivePermissions } from "@/lib/account-permissions";
import { getValidSupabaseSession, isSupabaseConfigured, supabase } from "@/lib/supabase";

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

type AccountApiPayload = {
  error?: string;
  isOwner?: boolean;
  profile?: {
    id?: string;
    username?: string;
    displayName?: string;
    workspaceOwnerId?: string;
    propertyAccessMode?: string;
  };
  propertyIds?: unknown;
  modulePermissions?: unknown;
  sensitivePermissions?: Partial<SensitivePermissions>;
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

function failedAccessState(status: number, payload: AccountApiPayload): AccountAccessState {
  const reason = typeof payload.error === "string" ? payload.error : "登录状态需要重新验证，请重新登录。";
  const authState = status === 401 && reason.includes("撤销")
    ? "session_revoked"
    : status === 401
      ? "unauthenticated"
      : status === 403 && reason.includes("停用")
        ? "account_disabled"
        : status === 403
          ? "forbidden"
          : "network_error";
  return { ...emptyState(), ready: true, authState, invalidReason: reason };
}

async function fetchCurrentAccount(accessToken: string) {
  const response = await fetch("/api/accounts/me", {
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const payload = await response.json().catch(() => ({})) as AccountApiPayload;
  return { response, payload };
}

function isExplicitlyRevoked(payload: AccountApiPayload) {
  return typeof payload.error === "string" && payload.error.includes("撤销");
}

async function resolveAccessState(): Promise<AccountAccessState> {
  if (!isSupabaseConfigured || !supabase) {
    return { ...emptyState(), ready: true, authState: "network_error", invalidReason: "系统尚未配置 Supabase 登录服务。" };
  }

  let session = await getValidSupabaseSession();
  if (!session) return { ...emptyState(), ready: true, authState: "unauthenticated" };

  let { response, payload } = await fetchCurrentAccount(session.access_token);
  if (response.status === 401 && !isExplicitlyRevoked(payload)) {
    session = await getValidSupabaseSession(true);
    if (!session) return { ...emptyState(), ready: true, authState: "unauthenticated" };
    ({ response, payload } = await fetchCurrentAccount(session.access_token));
  }

  // A persisted Supabase session can outlive an accidentally missing application
  // session row. Restore only a non-revoked, active account and then retry once.
  if (response.status === 401 && !isExplicitlyRevoked(payload)) {
    const restoreResponse = await fetch("/api/auth/restore-session", {
      method: "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${session.access_token}` }
    });
    const restorePayload = await restoreResponse.json().catch(() => ({})) as AccountApiPayload;
    if (!restoreResponse.ok) return failedAccessState(restoreResponse.status, restorePayload);
    ({ response, payload } = await fetchCurrentAccount(session.access_token));
  }

  if (!response.ok) {
    return failedAccessState(response.status, payload);
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
  const stateRef = useRef(state);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const authEventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastResumeCheckRef = useRef(0);

  const commitState = useCallback((next: AccountAccessState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const refresh = useCallback(async (silent = false) => {
    const shouldKeepScreen = silent && bootstrappedRef.current;
    if (shouldKeepScreen) {
      commitState({ ...stateRef.current, isRefreshing: true });
    } else {
      commitState({ ...stateRef.current, ready: false, isRefreshing: false, invalidReason: "" });
    }

    try {
      const next = await loadAccessState();
      bootstrappedRef.current = true;
      const current = stateRef.current;
      if (shouldKeepScreen && current.authenticated && (next.authState === "network_error" || next.authState === "unauthenticated")) {
        const preserved = { ...current, isRefreshing: false };
        latestAccessState = preserved;
        commitState(preserved);
        return;
      }
      latestAccessState = next;
      commitState(next);
    } catch {
      // A transient background failure must not blank an already authorized page.
      const current = stateRef.current;
      const next = shouldKeepScreen && current.authenticated
        ? { ...current, isRefreshing: false }
        : { ...emptyState(), ready: true, authState: "network_error" as const, invalidReason: "网络连接异常，请稍后重试。" };
      latestAccessState = next;
      commitState(next);
    }
  }, [commitState]);

  useEffect(() => {
    mountedRef.current = true;
    refresh(Boolean(latestAccessState?.ready)).catch(() => undefined);

    if (!supabase) return () => { mountedRef.current = false; };

    const scheduleSilentRefresh = (delay = 0) => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = setTimeout(() => {
        resumeTimerRef.current = null;
        refresh(true).catch(() => undefined);
      }, delay);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        latestAccessState = null;
        bootstrappedRef.current = true;
        commitState({ ...emptyState(), ready: true, authState: "unauthenticated" });
        return;
      }

      // Supabase can emit SIGNED_IN again when a tab regains focus. Defer all
      // non-sign-out events so the auth callback never re-enters the SDK lock,
      // and never reset an already-rendered application to the bootstrap screen.
      if (event === "INITIAL_SESSION" || event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        if (authEventTimerRef.current) clearTimeout(authEventTimerRef.current);
        authEventTimerRef.current = setTimeout(() => {
          authEventTimerRef.current = null;
          refresh(bootstrappedRef.current).catch(() => undefined);
        }, 0);
      }
    });

    const handleResume = () => {
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastResumeCheckRef.current < 10_000) return;
      lastResumeCheckRef.current = now;
      scheduleSilentRefresh(150);
    };
    document.addEventListener("visibilitychange", handleResume);
    window.addEventListener("pageshow", handleResume);
    window.addEventListener("online", handleResume);

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      if (authEventTimerRef.current) clearTimeout(authEventTimerRef.current);
      document.removeEventListener("visibilitychange", handleResume);
      window.removeEventListener("pageshow", handleResume);
      window.removeEventListener("online", handleResume);
    };
  }, [commitState, refresh]);

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
