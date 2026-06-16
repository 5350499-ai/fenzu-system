"use client";

import { AppLayout, navGroups } from "@/components/app-layout";
import Link from "next/link";

export default function MorePage() {
  const items = navGroups.flatMap((group) => group.items).filter((item) => item.href !== "/");

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
        </div>
      </section>
    </AppLayout>
  );
}
