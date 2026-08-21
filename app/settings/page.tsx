"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { Toast } from "@/components/ui";
import { CURRENCY_OPTIONS, DEFAULT_CURRENCY, normalizeCurrencyCode, type CurrencyCode } from "@/lib/currency";
import { getValidSupabaseSession } from "@/lib/supabase";
import Link from "next/link";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const access = useAccountAccess();
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>(access.currencyCode || DEFAULT_CURRENCY);
  const [draftCurrency, setDraftCurrency] = useState<CurrencyCode>(access.currencyCode || DEFAULT_CURRENCY);
  const [currencySaving, setCurrencySaving] = useState(false);
  const [currencyMessage, setCurrencyMessage] = useState("");

  useEffect(() => {
    if (!access.ready || !access.authenticated) return;
    const next = access.currencyCode || DEFAULT_CURRENCY;
    setCurrencyCode(next);
    setDraftCurrency(next);
  }, [access.ready, access.authenticated, access.currencyCode]);

  async function saveCurrency() {
    if (draftCurrency === currencyCode || !access.canSensitive("canManageSettings")) return;
    setCurrencySaving(true);
    setCurrencyMessage("");
    try {
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("登录已失效，请重新登录。");
      const response = await fetch("/api/workspace/currency", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ currencyCode: draftCurrency })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = response.status === 401
          ? "登录已失效，请重新登录。"
          : response.status === 403
            ? "当前账号没有修改工作区货币的权限。"
            : response.status === 409
              ? "工作区货币状态已变化，请刷新后重试。"
              : payload.error || "保存货币失败，请稍后重试。";
        throw new Error(message);
      }
      const refreshed = await access.refresh();
      const saved = refreshed.currencyCode || draftCurrency;
      setCurrencyCode(saved);
      setDraftCurrency(saved);
      setCurrencyMessage("货币设置已保存");
    } catch (error: any) {
      setCurrencyMessage(error.message || "货币设置保存失败，请稍后重试。");
    } finally {
      setCurrencySaving(false);
    }
  }

  return (
    <AppLayout title="设置" description="系统设置与数据安全。">
      <section className="card panel settings-entry-card">
        <div className="panel-header"><div><h2 className="panel-title">合伙人管理</h2><p className="muted">管理合伙人姓名、状态及各房源利润比例。</p></div></div>
        <Link className="btn primary settings-entry-button" href="/partners">{access.isFreeSingle ? "打开成员管理" : "打开合伙人管理"}</Link>
      </section>

      {!access.isFreeSingle && access.canSensitive("canManageSettings") ? <section className="card panel settings-entry-card">
        <div className="panel-header"><div><h2 className="panel-title">附件归档与清理</h2><p className="muted">导出并保存历史附件，归档后可清理云端文件以释放空间。</p></div></div>
        <Link className="btn primary settings-entry-button" href="/admin/attachments">打开附件归档与清理</Link>
      </section> : null}

      <section className="card panel settings-entry-card">
        <div className="panel-header"><div><h2 className="panel-title">备份与恢复（数据）</h2><p className="muted">管理业务数据备份、恢复入口和报表导出。</p></div></div>
        <Link className="btn primary settings-entry-button" href="/data-center">打开备份与恢复（数据）</Link>
      </section>

      <section className="card panel settings-entry-card">
        <div className="panel-header"><div><h2 className="panel-title">账号安全</h2><p className="muted">查看当前账号邮箱状态并修改自己的密码。</p></div></div>
        <Link className="btn primary settings-entry-button" href="/settings/security">打开账号安全</Link>
      </section>

      <section className="card panel">
        <h2 className="panel-title">基础设置</h2>
        <div className="settings-list">
          <div className="settings-currency-control">
            <label className="settings-currency-row"><span>工作区货币</span><select aria-label="工作区货币" disabled={!access.canSensitive("canManageSettings") || currencySaving} value={draftCurrency} onChange={(event) => { setDraftCurrency(normalizeCurrencyCode(event.target.value)); setCurrencyMessage(""); }}>{CURRENCY_OPTIONS.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}</select></label>
            {access.canSensitive("canManageSettings") ? <button className="btn primary" type="button" disabled={currencySaving || draftCurrency === currencyCode} onClick={() => void saveCurrency()}>{currencySaving ? "保存中…" : "保存货币设置"}</button> : <p className="muted">仅工作区所有者或管理员可修改货币。</p>}
            <Toast message={currencyMessage} tone={currencyMessage === "货币设置已保存" ? "success" : "danger"} />
          </div>
          <span>默认押金月数</span>
          <span>默认租金收款日</span>
        </div>
      </section>
    </AppLayout>
  );
}
