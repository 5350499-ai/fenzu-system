"use client";

import { useEffect, useRef, useState } from "react";
import { cacheManager } from "@/lib/cache/cache-manager";
import { useAccountAccess } from "@/components/account-access";
import { loadBusinessData, propertyKey, roomKey, tenantKey, contractKey, rentPaymentKey, expenseKey, depositKey, viewingAppointmentKey, taskKey } from "@/lib/business-data";
import { getPartners } from "@/lib/partners";

const preloadKeys = [propertyKey, roomKey, tenantKey, contractKey, rentPaymentKey, expenseKey, depositKey, viewingAppointmentKey, taskKey] as const;

export function CacheRuntime() {
  const access = useAccountAccess();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState(cacheManager.getStats());
  const previousAccountId = useRef("");

  useEffect(() => {
    if (!access.ready || !access.authenticated) return;
    let cancelled = false;
    const run = () => {
      if (access.can("partnership_settlement", "view")) void getPartners().catch(() => undefined);
      const permitted = preloadKeys.filter((key) => {
        if (key === propertyKey || key === roomKey || key === tenantKey || key === contractKey) return access.can(key === tenantKey || key === contractKey ? "tenants" : key === propertyKey || key === roomKey ? key.replace("business-", "") as "properties" | "rooms" : "properties", "view");
        if (key === rentPaymentKey) return access.can("rent_payments", "view");
        if (key === expenseKey) return access.can("expenses", "view");
        if (key === depositKey) return access.can("deposits", "view");
        if (key === taskKey) return access.can("tasks", "view");
        return access.can("properties", "view");
      });
      permitted.forEach((key) => {
        if (cancelled) return;
        void loadBusinessData(key, []).catch(() => undefined);
      });
    };
    const handle = window.setTimeout(run, 250);
    const refresh = window.setInterval(() => setStats(cacheManager.getStats()), 1000);
    return () => { cancelled = true; window.clearTimeout(handle); window.clearInterval(refresh); };
  }, [access.ready, access.authenticated, access.permissionVersion]);

  useEffect(() => {
    if (access.ready && !access.authenticated) void cacheManager.clearAll();
    if (access.authenticated && access.userId && previousAccountId.current && previousAccountId.current !== access.userId) void cacheManager.clearAll();
    if (access.authenticated) previousAccountId.current = access.userId;
  }, [access.ready, access.authenticated, access.userId]);

  if (process.env.NODE_ENV !== "development") return null;
  return <>
    <button type="button" className="cache-runtime-toggle" onClick={() => setOpen((value) => !value)}>缓存</button>
    {open ? <aside className="cache-runtime-panel" aria-label="Cache Monitor">
      <strong>Cache Monitor</strong>
      <span>Memory 命中：{stats.memoryHits}</span>
      <span>IndexedDB 命中：{stats.indexedDbHits}</span>
      <span>服务器请求：{stats.serverRequests}</span>
      <span>最近更新：{stats.lastUpdatedAt ? new Date(stats.lastUpdatedAt).toLocaleTimeString() : "—"}</span>
      <button type="button" onClick={() => { cacheManager.setDisabled(!cacheManager.isDisabled()); setStats(cacheManager.getStats()); }}>
        {cacheManager.isDisabled() ? "启用缓存" : "停用缓存"}
      </button>
    </aside> : null}
  </>;
}
