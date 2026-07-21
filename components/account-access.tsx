"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { emptyModulePermissions, emptySensitivePermissions, type AccountModuleKey, type ModulePermission, type PermissionAction, type SensitivePermissionKey, type SensitivePermissions } from "@/lib/account-permissions";
import { getValidSupabaseSession, isSupabaseConfigured, supabase } from "@/lib/supabase";

type AccountAccessState = {
  ready: boolean;
  authenticated: boolean;
  isRefreshing: boolean;
  isServerVerified: boolean;
  authState: "initializing" | "restoring_snapshot" | "authenticated" | "refreshing" | "unauthenticated" | "session_revoked" | "account_disabled" | "forbidden" | "network_error";
  invalidReason: string;
  isOwner: boolean;
  accountType: "owner" | "custom";
  accountStatus: "active" | "disabled";
  userId: string;
  profileUsername: string;
  profileDisplayName: string;
  workspaceOwnerId: string;
  propertyAccessMode: "all" | "selected";
  propertyIds: string[];
  modulePermissions: ModulePermission[];
  sensitivePermissions: SensitivePermissions;
  lastVerifiedAt: string;
  permissionVersion: string;
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
    accountType?: string;
    status?: string;
    workspaceOwnerId?: string;
    propertyAccessMode?: string;
  };
  propertyIds?: unknown;
  modulePermissions?: unknown;
  sensitivePermissions?: unknown;
};

type AccountAccessSnapshot = {
  cacheVersion: 2;
  accountId: string;
  workspaceOwnerId: string;
  profileUsername: string;
  profileDisplayName: string;
  accountType: "owner" | "custom";
  accountStatus: "active";
  propertyAccessMode: "all" | "selected";
  propertyIds: string[];
  modulePermissions: ModulePermission[];
  sensitivePermissions: SensitivePermissions;
  lastVerifiedAt: string;
  permissionVersion: string;
  lastPath: string;
};

const ACCESS_SNAPSHOT_KEY_PREFIX = "fenzu.account-access.v2.";
const ACTIVE_SNAPSHOT_ACCOUNT_KEY = "fenzu.account-access.active-account.v2";
const LEGACY_ACCESS_SNAPSHOT_KEY = "fenzu.account-access.v1";

const emptyState = (): AccountAccessState => ({
  ready: false,
  authenticated: false,
  isRefreshing: false,
  isServerVerified: false,
  authState: "initializing",
  invalidReason: "",
  isOwner: false,
  accountType: "custom",
  accountStatus: "active",
  userId: "",
  profileUsername: "",
  profileDisplayName: "",
  workspaceOwnerId: "",
  propertyAccessMode: "selected",
  propertyIds: [],
  modulePermissions: emptyModulePermissions(),
  sensitivePermissions: emptySensitivePermissions(),
  lastVerifiedAt: "",
  permissionVersion: ""
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizePropertyIds(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && item.length > 0))] : [];
}

function normalizeModulePermissions(value: unknown): ModulePermission[] {
  const supplied = Array.isArray(value) ? value.filter(isRecord) : [];
  const byKey = new Map(supplied
    .filter((item) => typeof item.moduleKey === "string")
    .map((item) => [item.moduleKey, item]));
  return emptyModulePermissions().map((base) => {
    const item = byKey.get(base.moduleKey);
    return {
      moduleKey: base.moduleKey,
      canView: Boolean(item?.canView),
      canCreate: Boolean(item?.canCreate),
      canEdit: Boolean(item?.canEdit),
      canArchive: Boolean(item?.canArchive),
      canDelete: Boolean(item?.canDelete)
    };
  });
}

function normalizeSensitivePermissions(value: unknown): SensitivePermissions {
  const supplied = isRecord(value) ? value : {};
  const normalized = emptySensitivePermissions();
  for (const key of Object.keys(normalized) as SensitivePermissionKey[]) {
    normalized[key] = Boolean(supplied[key]);
  }
  return normalized;
}

function normalizeLastPath(value: unknown) {
  const path = safeText(value);
  return path.startsWith("/") && !path.startsWith("//") && path !== "/login" ? path : "/";
}

function snapshotKey(accountId: string) {
  return `${ACCESS_SNAPSHOT_KEY_PREFIX}${accountId}`;
}

function readAccessSnapshot(): AccountAccessSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const accountId = safeText(window.localStorage.getItem(ACTIVE_SNAPSHOT_ACCOUNT_KEY));
    if (!accountId) return null;
    const parsed = JSON.parse(window.localStorage.getItem(snapshotKey(accountId)) || "null") as Partial<AccountAccessSnapshot> | null;
    if (!parsed || parsed.cacheVersion !== 2 || parsed.accountId !== accountId || parsed.accountStatus !== "active" || !parsed.workspaceOwnerId) return null;
    return {
      cacheVersion: 2,
      accountId,
      workspaceOwnerId: safeText(parsed.workspaceOwnerId),
      profileUsername: safeText(parsed.profileUsername),
      profileDisplayName: safeText(parsed.profileDisplayName),
      accountType: parsed.accountType === "owner" ? "owner" : "custom",
      accountStatus: "active",
      propertyAccessMode: parsed.propertyAccessMode === "all" ? "all" : "selected",
      propertyIds: normalizePropertyIds(parsed.propertyIds),
      modulePermissions: normalizeModulePermissions(parsed.modulePermissions),
      sensitivePermissions: normalizeSensitivePermissions(parsed.sensitivePermissions),
      lastVerifiedAt: safeText(parsed.lastVerifiedAt),
      permissionVersion: safeText(parsed.permissionVersion),
      lastPath: normalizeLastPath(parsed.lastPath)
    };
  } catch {
    return null;
  }
}

function snapshotState(snapshot: AccountAccessSnapshot): AccountAccessState {
  return {
    ready: true,
    authenticated: true,
    isRefreshing: true,
    isServerVerified: false,
    authState: "restoring_snapshot",
    invalidReason: "",
    isOwner: snapshot.accountType === "owner",
    accountType: snapshot.accountType,
    accountStatus: snapshot.accountStatus,
    userId: snapshot.accountId,
    profileUsername: snapshot.profileUsername,
    profileDisplayName: snapshot.profileDisplayName,
    workspaceOwnerId: snapshot.workspaceOwnerId,
    propertyAccessMode: snapshot.propertyAccessMode,
    propertyIds: normalizePropertyIds(snapshot.propertyIds),
    modulePermissions: normalizeModulePermissions(snapshot.modulePermissions),
    sensitivePermissions: normalizeSensitivePermissions(snapshot.sensitivePermissions),
    lastVerifiedAt: snapshot.lastVerifiedAt,
    permissionVersion: snapshot.permissionVersion
  };
}

function persistAccessSnapshot(state: AccountAccessState) {
  if (typeof window === "undefined" || !state.authenticated || !state.isServerVerified || state.accountStatus !== "active") return;
  const previous = readAccessSnapshot();
  const snapshot: AccountAccessSnapshot = {
    cacheVersion: 2,
    accountId: state.userId,
    workspaceOwnerId: state.workspaceOwnerId,
    profileUsername: state.profileUsername,
    profileDisplayName: state.profileDisplayName,
    accountType: state.accountType,
    accountStatus: "active",
    propertyAccessMode: state.propertyAccessMode,
    propertyIds: normalizePropertyIds(state.propertyIds),
    modulePermissions: normalizeModulePermissions(state.modulePermissions),
    sensitivePermissions: normalizeSensitivePermissions(state.sensitivePermissions),
    lastVerifiedAt: state.lastVerifiedAt,
    permissionVersion: state.permissionVersion,
    lastPath: previous?.accountId === state.userId ? previous.lastPath : "/"
  };
  try {
    window.localStorage.setItem(snapshotKey(state.userId), JSON.stringify(snapshot));
    window.localStorage.setItem(ACTIVE_SNAPSHOT_ACCOUNT_KEY, state.userId);
    window.localStorage.removeItem(LEGACY_ACCESS_SNAPSHOT_KEY);
  } catch {
    // Safari private storage failures must not break authentication.
  }
}

export function clearAccountAccessSnapshot() {
  latestAccessState = null;
  if (typeof window !== "undefined") {
    try {
      const accountId = safeText(window.localStorage.getItem(ACTIVE_SNAPSHOT_ACCOUNT_KEY));
      if (accountId) window.localStorage.removeItem(snapshotKey(accountId));
      window.localStorage.removeItem(ACTIVE_SNAPSHOT_ACCOUNT_KEY);
      window.localStorage.removeItem(LEGACY_ACCESS_SNAPSHOT_KEY);
    } catch {
      // The Supabase session remains the source of truth if storage is unavailable.
    }
  }
}

export function rememberAccountAccessPath(pathname: string) {
  if (typeof window === "undefined" || pathname === "/login") return;
  const snapshot = readAccessSnapshot();
  if (!snapshot) return;
  try {
    window.localStorage.setItem(snapshotKey(snapshot.accountId), JSON.stringify({ ...snapshot, lastPath: normalizeLastPath(pathname) }));
  } catch {
    // Path memory is optional and must never interrupt navigation.
  }
}

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

  const profile = isRecord(payload.profile) ? payload.profile : {};
  const userId = safeText(profile.id);
  const workspaceOwnerId = safeText(profile.workspaceOwnerId);
  if (!userId || !workspaceOwnerId) {
    return { ...emptyState(), ready: true, authState: "forbidden", invalidReason: "账户资料不完整，请重新登录。" };
  }

  const verifiedAt = new Date().toISOString();
  const accountType = profile.accountType === "owner" ? "owner" : "custom";
  return {
    ready: true,
    authenticated: true,
    isRefreshing: false,
    isServerVerified: true,
    authState: "authenticated",
    invalidReason: "",
    isOwner: accountType === "owner",
    accountType,
    accountStatus: profile.status === "disabled" ? "disabled" : "active",
    userId,
    profileUsername: safeText(profile.username),
    profileDisplayName: safeText(profile.displayName),
    workspaceOwnerId,
    propertyAccessMode: profile.propertyAccessMode === "all" ? "all" : "selected",
    propertyIds: normalizePropertyIds(payload.propertyIds),
    modulePermissions: normalizeModulePermissions(payload.modulePermissions),
    sensitivePermissions: normalizeSensitivePermissions(payload.sensitivePermissions),
    lastVerifiedAt: verifiedAt,
    permissionVersion: verifiedAt
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

  useLayoutEffect(() => {
    if (latestAccessState?.ready || stateRef.current.ready) return;
    const snapshot = readAccessSnapshot();
    if (!snapshot) return;
    const restored = snapshotState(snapshot);
    latestAccessState = restored;
    bootstrappedRef.current = true;
    commitState(restored);
  }, [commitState]);

  const refresh = useCallback(async (silent = false) => {
    const shouldKeepScreen = silent && bootstrappedRef.current;
    if (shouldKeepScreen) {
      commitState({
        ...stateRef.current,
        isRefreshing: true,
        authState: stateRef.current.isServerVerified ? "refreshing" : "restoring_snapshot"
      });
    } else {
      commitState({ ...stateRef.current, ready: false, isRefreshing: false, invalidReason: "" });
    }

    try {
      const next = await loadAccessState();
      bootstrappedRef.current = true;
      const current = stateRef.current;
      if (shouldKeepScreen && current.authenticated && next.authState === "network_error") {
        const preserved = {
          ...current,
          isRefreshing: false,
          authState: "network_error" as const,
          invalidReason: next.invalidReason || "网络连接异常，请稍后重试。"
        };
        latestAccessState = preserved;
        commitState(preserved);
        return;
      }
      latestAccessState = next;
      if (next.authenticated && next.isServerVerified) persistAccessSnapshot(next);
      else if (["unauthenticated", "session_revoked", "account_disabled"].includes(next.authState)) clearAccountAccessSnapshot();
      commitState(next);
    } catch {
      // A transient background failure must not blank an already authorized page.
      const current = stateRef.current;
      const next = shouldKeepScreen && current.authenticated
        ? { ...current, isRefreshing: false, authState: "network_error" as const, invalidReason: "网络连接异常，请稍后重试。" }
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
        clearAccountAccessSnapshot();
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
      if (action !== "view" && !state.isServerVerified) return false;
      if (state.isOwner) return true;
      const permission = normalizeModulePermissions(state.modulePermissions).find((item) => item.moduleKey === moduleKey);
      if (!permission) return false;
      return action === "view" ? permission.canView : action === "create" ? permission.canCreate : action === "edit" ? permission.canEdit : action === "archive" ? permission.canArchive : permission.canDelete;
    },
    canSensitive: (key) => state.isOwner || Boolean(normalizeSensitivePermissions(state.sensitivePermissions)[key]),
    canAccessProperty: (propertyId) => state.isOwner || state.propertyAccessMode === "all" || !propertyId || normalizePropertyIds(state.propertyIds).includes(propertyId),
    refresh: () => refresh(true)
  }), [refresh, state]);

  return <AccountAccessContext.Provider value={value}>{children}</AccountAccessContext.Provider>;
}

export function useAccountAccess() {
  return useContext(AccountAccessContext);
}
