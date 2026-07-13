"use client";

import { AppLayout, navGroups } from "@/components/app-layout";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function MorePage() {
  const items = navGroups.flatMap((group) => group.items).filter((item) => item.href !== "/");
  const [isOwner, setIsOwner] = useState(false);

  useEffect(() => {
    async function loadAccount() {
      const { data } = await supabase?.auth.getSession() || { data: { session: null } };
      if (!data.session) return;
      const response = await fetch("/api/accounts/me", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const payload = await response.json().catch(() => null);
      setIsOwner(Boolean(payload?.isOwner));
    }
    loadAccount().catch(() => undefined);
  }, []);

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
          {isOwner ? (
            <Link className="shortcut-card" href="/accounts">
              <span className="shortcut-icon blue"><ShieldCheck size={20} /></span>
              <strong>账号与权限</strong>
            </Link>
          ) : null}
        </div>
      </section>
    </AppLayout>
  );
}
