"use client";

import { AppLayout, navGroups } from "@/components/app-layout";
import Link from "next/link";
import { ScrollText, ShieldCheck } from "lucide-react";
import { useAccountAccess } from "@/components/account-access";
import type { AccountModuleKey } from "@/lib/account-permissions";

export default function MorePage() {
  const access = useAccountAccess();
  const canOpenModule = (moduleKey: AccountModuleKey) => {
    if (!access.can(moduleKey)) return false;
    if (moduleKey === "profits") return access.canSensitive("canViewProfits");
    if (moduleKey === "partnership_settlement") return access.canSensitive("canViewPartnershipSettlement");
    return true;
  };
  const items = navGroups.flatMap((group) => group.items).filter((item) => item.href !== "/" && canOpenModule(item.module as AccountModuleKey));

  return (
    <AppLayout title="更多" description="完整菜单集中放在这里，手机端首页优先显示经营数据。">
      <section className="card panel">
        <div className="shortcut-grid more-grid">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <Link className="shortcut-card" href={item.href} key={item.href}>
                <span className="shortcut-icon blue"><Icon size={20} /></span>
                <strong>{item.label}</strong>
              </Link>
            );
          })}
          {(access.isOwner && access.can("accounts")) || (access.can("audit_logs") && access.canSensitive("canViewAuditLogs")) ? (
            <>
              {access.isOwner && access.can("accounts") ? <Link className="shortcut-card" href="/accounts">
                <span className="shortcut-icon blue"><ShieldCheck size={20} /></span>
                <strong>账号与权限</strong>
              </Link> : null}
              {access.can("audit_logs") && access.canSensitive("canViewAuditLogs") ? <Link className="shortcut-card" href="/audit-logs">
                <span className="shortcut-icon blue"><ScrollText size={20} /></span>
                <strong>操作日志</strong>
              </Link> : null}
            </>
          ) : null}
        </div>
      </section>
    </AppLayout>
  );
}
