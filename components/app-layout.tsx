"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  CalendarCheck,
  ChevronRight,
  ClipboardList,
  CreditCard,
  FileArchive,
  FileText,
  Home,
  LineChart,
  LogIn,
  LogOut,
  Moon,
  ReceiptText,
  Settings,
  Sun,
  Users,
  WalletCards
} from "lucide-react";
import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";

export const navGroups = [
  {
    title: "分租管理",
    items: [
      { href: "/", label: "首页", icon: Home },
      { href: "/check-in", label: "一键入住", icon: LogIn },
      { href: "/properties", label: "房源管理", icon: Building2 },
      { href: "/rooms", label: "房间管理", icon: CalendarCheck },
      { href: "/tenants", label: "租客管理", icon: Users },
      { href: "/contracts", label: "合同管理", icon: FileText },
      { href: "/rent-payments", label: "收租管理", icon: ReceiptText },
      { href: "/expenses", label: "支出管理", icon: CreditCard },
      { href: "/deposits", label: "押金管理", icon: WalletCards }
    ]
  },
  {
    title: "运营工具",
    items: [
      { href: "/analytics", label: "统计分析", icon: LineChart },
      { href: "/archive", label: "档案中心", icon: FileArchive },
      { href: "/tasks", label: "待办管理", icon: ClipboardList }
    ]
  },
  {
    title: "系统",
    items: [{ href: "/settings", label: "设置", icon: Settings }]
  }
];

const mobileItems = [
  { href: "/", label: "首页", icon: Home },
  { href: "/properties", label: "房源", icon: Building2 },
  { href: "/tenants", label: "租客", icon: Users },
  { href: "/rent-payments", label: "收租", icon: ReceiptText },
  { href: "/more", label: "更多", icon: ChevronRight }
];

export function AppLayout({ children, title, description }: { children: React.ReactNode; title: string; description?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState("light");
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    const saved = window.localStorage.getItem("theme") || "light";
    setTheme(saved);
    document.documentElement.dataset.theme = saved;
  }, []);

  useEffect(() => {
    let alive = true;

    async function checkAuth() {
      if (!isSupabaseConfigured || !supabase) {
        if (!alive) return;
        setAuthError("系统尚未配置 Supabase 登录服务。");
        setAuthChecked(true);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!alive) return;

      if (!data.session) {
        router.replace("/login");
        return;
      }

      setAuthChecked(true);
    }

    checkAuth();

    const { data: listener } = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    }) || { data: { subscription: null } };

    return () => {
      alive = false;
      listener.subscription?.unsubscribe();
    };
  }, [router]);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    window.localStorage.setItem("theme", next);
    document.documentElement.dataset.theme = next;
  }

  async function logout() {
    await supabase?.auth.signOut();
    router.push("/login");
  }

  if (!authChecked) {
    return (
      <main className="login-page">
        <section className="card login-card">
          <div className="brand-title">正在检查登录状态...</div>
          {authError ? <p className="danger-text">{authError}</p> : null}
        </section>
      </main>
    );
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
        {navGroups.map((group) => (
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
          <div className="top-actions">
            <button className="btn" onClick={toggleTheme} type="button">
              {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
              主题
            </button>
            <button className="btn danger" onClick={logout} type="button">
              <LogOut size={17} />
              退出
            </button>
          </div>
        </header>
        {children}
      </main>

      <nav className="mobile-nav">
        {mobileItems.map((item) => {
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
