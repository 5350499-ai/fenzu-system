"use client";

import { AppLayout } from "@/components/app-layout";
import { getValidSupabaseSession } from "@/lib/supabase";
import { euro } from "@/lib/format";
import { compareSettlementHistory } from "@/lib/partner-settlement";
import { useEffect, useMemo, useState } from "react";

type Batch = {
  id: string;
  property_id: string;
  period_start: string;
  period_end: string;
  status: "confirmed" | "reversed";
  total_income: number;
  total_expense: number;
  net_profit: number;
  confirmed_at: string;
  reversed_at?: string | null;
  reversal_reason?: string | null;
};

type Snapshot = {
  batch: Batch;
  partners: Array<any>;
  segments: Array<any>;
  transfers: Array<any>;
};

type PageState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? euro(amount) : "未保存";
}

function shareSummary(partner: any, segments: Array<any>) {
  const values = Array.isArray(partner.share_segments_snapshot) ? partner.share_segments_snapshot : [];
  if (segments.length > 1 || values.length > 1) return `参与${Math.max(segments.length, values.length)}个比例分段`;
  const percentage = Number(values[0]?.percentage);
  return Number.isFinite(percentage) ? `${percentage}%` : "比例未保存";
}

function balanceSummary(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return { label: "金额未保存", value: "" };
  if (amount > 0) return { label: "应付", value: money(Math.abs(amount)) };
  if (amount < 0) return { label: "应收", value: money(Math.abs(amount)) };
  return { label: "已平衡", value: "" };
}

function AuthExpiredState() {
  return <AppLayout title="登录已失效"><section className="card panel auth-expired-state"><h2 className="panel-title">登录已失效</h2><p className="muted">请重新登录后继续查看结算历史。</p><a className="btn primary" href={`/login?returnTo=${encodeURIComponent("/partner-settlements")}`}>重新登录</a></section></AppLayout>;
}

export default function PartnerSettlementHistoryPage() {
  const [state, setState] = useState<PageState>("loading");
  const [message, setMessage] = useState("");
  const [batches, setBatches] = useState<Batch[]>([]);
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [propertyId, setPropertyId] = useState("all");
  const [status, setStatus] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const session = await getValidSupabaseSession();
        if (!session) { setState("unauthorized"); return; }
        const headers = { Authorization: `Bearer ${session.access_token}` };
        const [historyResponse, partnersResponse] = await Promise.all([
          fetch("/api/partner-settlements", { headers, cache: "no-store" }),
          fetch("/api/partners", { headers, cache: "no-store" }),
        ]);
        const history = await historyResponse.json().catch(() => ({}));
        const partnerPayload = await partnersResponse.json().catch(() => ({}));
        if (!historyResponse.ok) { setState(historyResponse.status === 401 ? "unauthorized" : historyResponse.status === 403 ? "forbidden" : "error"); setMessage(history.error || "结算历史加载失败，请稍后重试"); return; }
        if (!partnersResponse.ok) { setState(partnersResponse.status === 401 ? "unauthorized" : partnersResponse.status === 403 ? "forbidden" : "error"); setMessage(partnerPayload.error || "房源加载失败，请稍后重试"); return; }
        if (!cancelled) { setBatches(history.batches || []); setProperties(partnerPayload.properties || []); setState("ready"); }
      } catch (error) {
        if (!cancelled) { setState("error"); setMessage(error instanceof Error ? error.message : "结算历史加载失败，请稍后重试"); }
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => batches.filter((batch) => (propertyId === "all" || batch.property_id === propertyId) && (status === "all" || batch.status === status) && (!startDate || batch.period_end >= startDate) && (!endDate || batch.period_start <= endDate)).sort((a, b) => compareSettlementHistory({ status: a.status, periodEnd: a.period_end, confirmedAt: a.confirmed_at, reversedAt: a.reversed_at }, { status: b.status, periodEnd: b.period_end, confirmedAt: b.confirmed_at, reversedAt: b.reversed_at })), [batches, endDate, propertyId, startDate, status]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  if (state === "loading") return <AppLayout title="结算历史"><section className="card panel"><p className="muted">正在加载结算历史…</p></section></AppLayout>;
  if (state === "unauthorized") return <AuthExpiredState />;
  if (state === "forbidden") return <AppLayout title="结算历史"><section className="card panel"><h2 className="panel-title">没有访问权限</h2><p className="muted">当前账号没有查看合伙结算的权限。</p></section></AppLayout>;
  if (state === "error") return <AppLayout title="结算历史"><section className="card panel"><h2 className="panel-title">结算历史加载失败</h2><p className="error-text">{message}</p><button className="btn" type="button" onClick={() => window.location.reload()}>重新加载</button></section></AppLayout>;

  return <AppLayout title="结算历史" description="查看不可变结算快照及撤销状态。"><section className="card panel settlement-history-panel">
    <div className="panel-header"><div><h2 className="panel-title">结算历史</h2><p className="muted">已确认快照不会随合伙人改名或比例调整而改变。</p></div><a className="btn compact" href="/partnership-settlement">返回结算</a></div>
    <div className="filter-grid"><div className="field"><label>房源筛选</label><select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setPage(1); }}><option value="all">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div><div className="field"><label>状态</label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">全部</option><option value="confirmed">已结算</option><option value="reversed">已撤销</option></select></div><div className="field"><label>开始日期</label><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></div><div className="field"><label>结束日期</label><input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></div></div>
    <div className="settlement-history-list">{visible.map((batch) => <SettlementHistoryCard key={batch.id} batch={batch} propertyName={properties.find((property) => property.id === batch.property_id)?.name || "房源名称未保存"} />)}{!filtered.length ? <p className="muted">暂无结算记录</p> : null}</div>
    {filtered.length > pageSize ? <div className="button-row"><button className="btn compact" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span className="muted">第 {page} / {pageCount} 页</span><button className="btn compact" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页</button></div> : null}
  </section></AppLayout>;
}

function SettlementHistoryCard({ batch, propertyName }: { batch: Batch; propertyName: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadSnapshot() {
      try {
        const session = await getValidSupabaseSession();
        if (!session) throw new Error("登录已失效，请重新登录");
        const response = await fetch(`/api/partner-settlements/${batch.id}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "摘要加载失败");
        if (!cancelled) setSnapshot(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "摘要加载失败");
      }
    }
    void loadSnapshot();
    return () => { cancelled = true; };
  }, [batch.id]);

  const partners = snapshot?.partners || [];
  const segments = snapshot?.segments || [];
  const transfers = snapshot?.transfers || [];
  return <article className="settlement-history-card">
    <div className="settlement-history-card-body">
      <strong className="settlement-history-property">{propertyName}</strong>
      <span className="settlement-history-period">{batch.period_start} 至 {batch.period_end}</span>
      <div className="settlement-history-summary-metrics"><span>收入 <b>{money(batch.total_income)}</b></span><span>支出 <b>{money(batch.total_expense)}</b></span><span className={Number(batch.net_profit) < 0 ? "danger-text" : "profit"}>净利润 <b>{money(batch.net_profit)}</b></span></div>
      <div className="settlement-history-allocation"><div className="settlement-history-allocation-title">{segments.length > 1 ? `比例方案：${segments.length}段` : "合伙人分配"}</div>{error ? <p className="muted">摘要暂不可用：{error}</p> : !snapshot ? <p className="muted">正在读取已保存摘要…</p> : partners.length ? partners.map((partner: any) => { const balance = balanceSummary(partner.settlement_balance); return <div className="settlement-history-partner" key={partner.id}><strong>{partner.partner_display_name_snapshot || "合伙人名称未保存"}</strong><span>{shareSummary(partner, segments)}</span><span className={balance.label === "应收" ? "profit" : balance.label === "应付" ? "danger-text" : "muted"}>{balance.label}{balance.value ? ` ${balance.value}` : ""}</span></div>; }) : <p className="muted">该快照未保存合伙人摘要。</p>}</div>
      <div className="settlement-history-transfers"><strong>最终转账</strong>{!snapshot ? null : transfers.length ? transfers.map((transfer: any) => <span key={transfer.id}>{transfer.from_name_snapshot} 转给 {transfer.to_name_snapshot} {money(transfer.amount)}</span>) : <span className="muted">本次无需相互转账</span>}</div>
      {batch.status === "reversed" ? <div className="settlement-history-reversal"><span className="status-badge muted-badge">已撤销</span>{batch.reversed_at ? <span>撤销于：{new Date(batch.reversed_at).toLocaleString("zh-CN")}</span> : null}{batch.reversal_reason ? <span>{batch.reversal_reason}</span> : null}</div> : null}
      <div className="settlement-history-card-footer"><span className={`status-badge ${batch.status === "confirmed" ? "success" : "muted-badge"}`}>{batch.status === "confirmed" ? "已结算" : "已撤销"}</span><a className="btn compact primary" href={`/partner-settlements/${batch.id}`}>打开完整快照</a></div>
    </div>
  </article>;
}
