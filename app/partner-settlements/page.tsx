"use client";

import { AppLayout } from "@/components/app-layout";
import { getValidSupabaseSession } from "@/lib/supabase";
import { euro } from "@/lib/format";
import { useEffect, useMemo, useState, type SyntheticEvent } from "react";

type Batch = { id: string; property_id: string; period_start: string; period_end: string; status: "confirmed" | "reversed"; total_income: number; total_expense: number; net_profit: number; confirmed_at: string };
type PageState = "loading" | "ready" | "unauthorized" | "forbidden" | "error";

function shareLines(value: unknown, partners: any[]) {
  if (!Array.isArray(value)) return ["比例信息未保存"];
  return value.map((share: any, index: number) => {
    const partnerId = share.partnerId || share.partner_id;
    const partner = partners.find((item) => item.partner_id === partnerId);
    return `${share.displayName || share.display_name || partner?.partner_display_name_snapshot || `合伙人${index + 1}`} ${Number(share.percentage || 0)}%`;
  });
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
        const [historyResponse, partnersResponse] = await Promise.all([fetch("/api/partner-settlements", { headers, cache: "no-store" }), fetch("/api/partners", { headers, cache: "no-store" })]);
        const history = await historyResponse.json().catch(() => ({}));
        const partnerPayload = await partnersResponse.json().catch(() => ({}));
        if (!historyResponse.ok) { setState(historyResponse.status === 401 ? "unauthorized" : historyResponse.status === 403 ? "forbidden" : "error"); setMessage(history.error || "结算历史加载失败，请稍后重试"); return; }
        if (!partnersResponse.ok) { setState(partnersResponse.status === 401 ? "unauthorized" : partnersResponse.status === 403 ? "forbidden" : "error"); setMessage(partnerPayload.error || "房源加载失败，请稍后重试"); return; }
        if (!cancelled) { setBatches(history.batches || []); setProperties(partnerPayload.properties || []); setState("ready"); }
      } catch (error) { if (!cancelled) { setState("error"); setMessage(error instanceof Error ? error.message : "结算历史加载失败，请稍后重试"); } }
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

  return <AppLayout title="结算历史" description="查看不可变结算快照及撤销状态。"><section className="card panel settlement-history-panel">
    <div className="panel-header"><div><h2 className="panel-title">结算历史</h2><p className="muted">已确认快照不会随合伙人改名或比例调整而改变。</p></div><a className="btn compact" href="/partnership-settlement">返回结算</a></div>
    <div className="filter-grid"><div className="field"><label>房源筛选</label><select value={propertyId} onChange={(event) => { setPropertyId(event.target.value); setPage(1); }}><option value="all">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div><div className="field"><label>状态</label><select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="all">全部</option><option value="confirmed">已结算</option><option value="reversed">已撤销</option></select></div><div className="field"><label>开始日期</label><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setPage(1); }} /></div><div className="field"><label>结束日期</label><input type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); setPage(1); }} /></div></div>
    <div className="settlement-history-list">{visible.map((batch) => <SettlementHistoryCard key={batch.id} batch={batch} propertyName={properties.find((property) => property.id === batch.property_id)?.name || "房源名称未保存"} />)}{!filtered.length ? <p className="muted">暂无结算记录</p> : null}</div>
    {filtered.length > pageSize ? <div className="button-row"><button className="btn compact" type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button><span className="muted">第 {page} / {pageCount} 页</span><button className="btn compact" type="button" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>下一页</button></div> : null}
  </section></AppLayout>;
}

function SettlementHistoryCard({ batch, propertyName }: { batch: Batch; propertyName: string }) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  async function toggle(event: SyntheticEvent<HTMLDetailsElement>) {
    const nextOpen = event.currentTarget.open;
    setOpen(nextOpen);
    if (!nextOpen || snapshot || loading) return;
    setLoading(true);
    try {
      const session = await getValidSupabaseSession();
      if (!session) throw new Error("登录已失效，请重新登录");
      const response = await fetch(`/api/partner-settlements/${batch.id}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "快照加载失败");
      setSnapshot(payload);
    } catch (error) {
      setSnapshot({ error: error instanceof Error ? error.message : "快照加载失败" });
    } finally {
      setLoading(false);
    }
  }
  return <details className="settlement-history-card" onToggle={toggle}><summary><span className="settlement-history-summary-main"><strong>{propertyName}</strong><span>{batch.period_start} 至 {batch.period_end}</span></span><span className="settlement-history-summary-metrics"><span>收入 {euro(Number(batch.total_income))}</span><span>支出 {euro(Number(batch.total_expense))}</span><strong className={Number(batch.net_profit) < 0 ? "danger-text" : "profit"}>净利润 {euro(Number(batch.net_profit))}</strong></span><span className={`status-badge ${batch.status === "confirmed" ? "success" : "muted-badge"}`}>{batch.status === "confirmed" ? "已结算" : "已撤销"}</span><span className="settlement-history-expand">{open ? "收起完整快照" : "展开完整快照"}</span></summary><div className="settlement-history-card-actions"><a className="btn compact primary" href={`/partner-settlements/${batch.id}`}>打开快照详情</a>{loading ? <p className="muted">正在读取保存的快照…</p> : null}{snapshot?.error ? <p className="error-text">{snapshot.error}</p> : null}{snapshot && !snapshot.error ? <InlineSnapshot snapshot={snapshot} /> : null}</div></details>;
}

function InlineSnapshot({ snapshot }: { snapshot: any }) {
  const batch = snapshot.batch;
  const income = Array.isArray(batch.income_details_snapshot) ? batch.income_details_snapshot : [];
  const expense = Array.isArray(batch.expense_details_snapshot) ? batch.expense_details_snapshot : [];
  return <div className="snapshot-inline"><p className="muted">确认时间：{new Date(batch.confirmed_at).toLocaleString("zh-CN")} · 确认人：{batch.confirmed_by_display_name_snapshot || "确认账号名称未保存"}</p><p>汇总：收入 {euro(Number(batch.total_income))} · 支出 {euro(Number(batch.total_expense))} · 净利润 {euro(Number(batch.net_profit))}</p><h4>比例分段</h4>{snapshot.segments.map((segment: any, index: number) => <article className="snapshot-segment" key={segment.id}><strong>比例分段 {index + 1}：{segment.segment_start} 至 {segment.segment_end}</strong><div className="snapshot-share-list">{shareLines(segment.shares_snapshot, snapshot.partners).map((line, shareIndex) => <span key={`${line}-${shareIndex}`}>{line}</span>)}</div><p>收入 {euro(Number(segment.total_income))} · 支出 {euro(Number(segment.total_expense))} · 净利润 {euro(Number(segment.net_profit))}</p></article>)}<h4>合伙人结算明细</h4><div className="settlement-grid">{snapshot.partners.map((partner: any) => <article className="settlement-card" key={partner.id}><strong>{partner.partner_display_name_snapshot}</strong><div className="profit-card-metrics"><span>代收 <b>{euro(Number(partner.actual_collected))}</b></span><span>垫付 <b>{euro(Number(partner.actual_paid))}</b></span><span>实际留存 <b>{euro(Number(partner.actual_retained))}</b></span><span>应得利润 <b>{euro(Number(partner.profit_entitlement))}</b></span><span>结算余额 <b>{euro(Number(partner.settlement_balance))}</b></span></div><p className={Number(partner.settlement_balance) > 0 ? "danger-text" : Number(partner.settlement_balance) < 0 ? "profit" : "muted"}>{Number(partner.settlement_balance) > 0 ? "应付" : Number(partner.settlement_balance) < 0 ? "应收" : "已平衡"}</p></article>)}</div><h4>最终转账建议</h4>{snapshot.transfers.length ? snapshot.transfers.map((transfer: any) => <p key={transfer.id}>{transfer.from_name_snapshot} 转给 {transfer.to_name_snapshot}：{euro(Number(transfer.amount))}</p>) : <p className="muted">本次无需相互转账</p>}<h4>收支逐笔明细</h4>{income.length || expense.length ? <>{income.map((item: any, index: number) => <p key={item.paymentId || index}>收入 · {item.date} · {item.partnerName} · {euro(Number(item.amount))}</p>)}{expense.map((item: any, index: number) => <p key={item.expenseId || index}>支出 · {item.date} · {item.partnerName} · {euro(Number(item.amount))}</p>)}</> : <p className="muted">该快照确认时未保存逐笔收入明细或支出明细。</p>}</div>;
}

function AuthExpiredState() { return <AppLayout title="登录已失效"><section className="card panel auth-expired-state"><h2 className="panel-title">登录已失效</h2><p className="muted">请重新登录后继续查看结算历史。</p><a className="btn primary" href={`/login?returnTo=${encodeURIComponent("/partner-settlements")}`}>重新登录</a></section></AppLayout>; }
