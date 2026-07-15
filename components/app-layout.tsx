"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  Bell,
  BarChart3,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileArchive,
  HandCoins,
  Home,
  LineChart,
  LogIn,
  ReceiptText,
  Settings,
  Users,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAccountAccess } from "@/components/account-access";
import { AccountCenter } from "@/components/account-center";
import type { AccountModuleKey } from "@/lib/account-permissions";

export const navGroups = [
  {
    title: "分租管理",
    items: [
      { href: "/", label: "首页", icon: Home, module: "home" },
      { href: "/check-in", label: "一键入住", icon: LogIn, module: "check_in" },
      { href: "/properties", label: "房源管理", icon: Building2, module: "properties" },
      { href: "/rooms", label: "房间管理", icon: CalendarCheck, module: "rooms" },
      { href: "/tenants", label: "租客管理", icon: Users, module: "tenants" },
      { href: "/rent-payments", label: "收租管理", icon: ReceiptText, module: "rent_payments" },
      { href: "/expenses", label: "支出管理", icon: CreditCard, module: "expenses" },
      { href: "/partnership-settlement", label: "合伙结算", icon: HandCoins, module: "partnership_settlement" },
      { href: "/deposits", label: "押金管理", icon: WalletCards, module: "deposits" }
    ]
  },
  {
    title: "运营工具",
    items: [
      { href: "/reminders", label: "提醒中心", icon: Bell, module: "reminders" },
      { href: "/property-profits", label: "利润分析", icon: BarChart3, module: "profits" },
      { href: "/analytics", label: "统计分析", icon: LineChart, module: "analytics" },
      { href: "/archive", label: "档案中心", icon: FileArchive, module: "archive" },
      { href: "/tasks", label: "待办管理", icon: ClipboardList, module: "tasks" }
    ]
  },
  {
    title: "系统",
    items: [{ href: "/settings", label: "设置", icon: Settings, module: "settings" }]
  }
];

const mobileItems = [
  { href: "/", label: "首页", icon: Home, module: "home" },
  { href: "/tasks", label: "待办", icon: ClipboardList, module: "tasks" },
  { href: "/property-profits", label: "利润", icon: BarChart3, module: "profits" },
  { href: "/analytics", label: "统计", icon: LineChart, module: "analytics" },
  { href: "/more", label: "更多", icon: ChevronRight }
];

export function AppLayout({ children, title, description }: { children: React.ReactNode; title: string; description?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState("light");
  const access = useAccountAccess();
  const routeModule = moduleForPath(pathname);
  const canOpenModule = (moduleKey: AccountModuleKey) => {
    if (!access.can(moduleKey)) return false;
    if (moduleKey === "profits") return access.canSensitive("canViewProfits");
    if (moduleKey === "partnership_settlement") return access.canSensitive("canViewPartnershipSettlement");
    if (moduleKey === "audit_logs") return access.canSensitive("canViewAuditLogs");
    if (moduleKey === "accounts") return access.isOwner;
    return true;
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("theme") || "light";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  useEffect(() => {
    if (access.ready && !access.authenticated && !access.invalidReason) router.replace("/login");
  }, [access.authenticated, access.invalidReason, access.ready, router]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("theme", next);
    document.documentElement.dataset.theme = next;
  }

  async function logout() {
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    if (data.session) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      }).catch(() => undefined);
    }
    await supabase?.auth.signOut({ scope: "local" });
    router.replace("/login");
  }

  if (!access.ready) {
    return (
      <main className="login-page">
        <section className="card login-card">
          <div className="brand-title">正在检查登录状态...</div>
        </section>
      </main>
    );
  }

  if (!access.authenticated) {
    return <AccessRecovery description={access.invalidReason || "登录状态已失效，请重新登录。"} onHome={() => router.push("/")} onBack={() => router.back()} onLogout={logout} />;
  }

  if (routeModule && !canOpenModule(routeModule)) {
    return <AccessRecovery description="当前账号没有查看此页面的权限。请联系主管理员调整权限。" onHome={() => router.push("/")} onBack={() => router.back()} onLogout={logout} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">租</div>
          <div>
            <div className="brand-title">西班牙分租房</div>
            <div className="brand-subtitle">经营管理系统</div>
          </div>
        </div>
        {navGroups.map((group) => ({ ...group, items: group.items.filter((item) => canOpenModule(item.module as AccountModuleKey)) })).filter((group) => group.items.length).map((group) => (
          <nav className="nav-group" key={group.title}>
            <p className="nav-heading">{group.title}</p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link className={`nav-link ${active ? "active" : ""}`} href={item.href} key={item.href}>
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        ))}
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <h1 className="page-title">{title}</h1>
            {description ? <p className="page-desc">{description}</p> : null}
          </div>
          <div className="top-actions zanjia-top-actions">
            <button className="zanjia-theme-toggle" onClick={toggleTheme} type="button" aria-label="切换主题">
              {theme === "light" ? "🌙" : "☀️"}
            </button>
            <AccountCenter />
          </div>
        </header>
        {children}
      </main>

      <nav className="mobile-nav">
        {mobileItems.filter((item) => !item.module || canOpenModule(item.module as AccountModuleKey)).map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link className={active ? "active" : ""} href={item.href} key={item.href}>
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function AccessRecovery({ description, onHome, onBack, onLogout }: { description: string; onHome: () => void; onBack: () => void; onLogout: () => void }) {
  return (
    <main className="login-page">
      <section className="card login-card">
        <div className="brand-title">没有权限访问此页面</div>
        <p className="muted">{description}</p>
        <div className="modal-actions">
          <button className="btn" type="button" onClick={onHome}>返回首页</button>
          <button className="btn" type="button" onClick={onBack}>返回上一页</button>
          <button className="btn primary" type="button" onClick={onLogout}>退出并重新登录</button>
        </div>
      </section>
    </main>
  );
}

function moduleForPath(pathname: string): AccountModuleKey | null {
  if (pathname === "/") return "home";
  if (pathname.startsWith("/check-in")) return "check_in";
  if (pathname.startsWith("/properties")) return "properties";
  if (pathname.startsWith("/rooms")) return "rooms";
  if (pathname.startsWith("/tenants") || pathname.startsWith("/contracts")) return "tenants";
  if (pathname.startsWith("/rent-payments")) return "rent_payments";
  if (pathname.startsWith("/expenses")) return "expenses";
  if (pathname.startsWith("/deposits")) return "deposits";
  if (pathname.startsWith("/partnership-settlement")) return "partnership_settlement";
  if (pathname.startsWith("/reminders")) return "reminders";
  if (pathname.startsWith("/property-profits")) return "profits";
  if (pathname.startsWith("/analytics")) return "analytics";
  if (pathname.startsWith("/archive")) return "archive";
  if (pathname.startsWith("/tasks")) return "tasks";
  if (pathname.startsWith("/settings")) return "settings";
  if (pathname.startsWith("/accounts")) return "accounts";
  if (pathname.startsWith("/audit-logs")) return "audit_logs";
  return null;
}
