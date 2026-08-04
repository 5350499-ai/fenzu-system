"use client";

import { AppLayout } from "@/components/app-layout";
import { getValidSupabaseSession } from "@/lib/supabase";
import { euro } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";

type Batch = { id: string; property_id: string; period_start: string; period_end: string; status: "confirmed" | "reversed"; total_income: number; total_expense: number; net_profit: number; confirmed_at: string; };
type PageState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";

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
        const [historyResponse, partnersResponse] = await Promise.all([fetch("/api/partner-settlements", { headers, cache: "no-store" }), fetch("/api/partners", { headers, cache: "no-store" })]);
        const history = await historyResponse.json().catch(() => ({}));
        const partnerPayload = await partnersResponse.json().catch(() => ({}));
        if (!historyResponse.ok) { setState(historyResponse.status === 401 ? "unauthorized" : historyResponse.status === 403 ? "forbidden" : "error"); setMessage(history.error || "结算历史加载失败，请稍后重试。"); return; }
        if (!partnersResponse.ok) { setState(partnersResponse.status === 401 ? "unauthorized" : partnersResponse.status === 403 ? "forbidden" : "error"); setMessage(partnerPayload.error || "房源加载失败，请稍后重试。"); return; }
        if (!cancelled) { setBatches(history.batches || []); setProperties(partnerPayload.properties || []); setState("ready"); }
      } catch (error) { if (!cancelled) { setState("error"); setMessage(error instanceof Error ? error.message : "结算历史加载失败，请稍后重试。"); } }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => batches.filter((batch) => (propertyId === "all" || batch.property_id === propertyId) && (status === "all" || batch.status === status) && (!startDate || batch.period_end >= startDate) && (!endDate || batch.period_start <= endDate)), [batches, endDate, propertyId, startDate, status]);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));

  if (state === "loading") return <AppLayout title="结算历史"><section className="card panel"><p className="muted">正在加载结算历史…</p></section></AppLayout>;
  if (state === "unauthorized") return <AuthExpiredState />;
  if (state === "forbidden") return <AppLayout title="结算历史"><section className="card panel"><h2 className="panel-title">没有访问权限</h2><p className="muted">当前账号没有查看合伙结算的权限。</p></section></AppLayout>;
  if (state === "error") return <AppLayout title="结算历史"><section className="card panel"><h2 className="panel-title">结算历史加载失败</h2><p className="error-text">{message}</p><button className="btn" type="button" onClick={() => window.location.reload()}>重新加载</button></section></AppLayout>;

  return <AppLayout title="结算历史" description="查看不可变结算快照及撤销状态。"><section className="card panel"><div className="panel-header"><div><h2 className="panel-title">结算历史</h2><p className="muted">已确认快照不会随合伙人改名或比例调整而改变。</p></div><a className="btn compact" href="/partnership-settlement">返回结算</a></div><div className="filter-grid"><div className="field"><label>房源筛选</label><select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setPage(1); }}><option value="all">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div><div className="field"><label>状态</label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">全部</option><option value="confirmed">已结算</option><option value="reversed">已撤销</option></select></div><div className="field"><label>开始日期</label><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></div><div className="field"><label>结束日期</label><input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></div></div><div className="settlement-detail-list">{visible.map((batch) => <a className="settlement-history-row" href={`/partner-settlements/${batch.id}`} key={batch.id}><span>{properties.find((property) => property.id === batch.property_id)?.name || batch.property_id}</span><span>{batch.period_start} 至 {batch.period_end}</span><span>收入 {euro(Number(batch.total_income))}</span><span>支出 {euro(Number(batch.total_expense))}</span><strong className={Number(batch.net_profit) < 0 ? "danger-text" : "profit"}>净利润 {euro(Number(batch.net_profit))}</strong><span>{batch.status === "confirmed" ? "已结算" : "已撤销"}</span><small>确认于 {new Date(batch.confirmed_at).toLocaleString("zh-CN")}</small></a>)}{!filtered.length ? <p className="muted">暂无结算记录</p> : null}</div>{filtered.length > pageSize ? <div className="button-row"><button className="btn compact" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span className="muted">第 {page} / {pageCount} 页</span><button className="btn compact" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页</button></div> : null}</section></AppLayout>;
}

function AuthExpiredState() { return <AppLayout title="登录已失效"><section className="card panel auth-expired-state"><h2 className="panel-title">登录已失效</h2><p className="muted">请重新登录后继续查看和确认合伙结算。</p><a className="btn primary" href={`/login?returnTo=${encodeURIComponent("/partner-settlements")}`}>重新登录</a></section></AppLayout>; }
