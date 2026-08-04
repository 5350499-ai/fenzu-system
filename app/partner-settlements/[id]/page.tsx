"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { euro } from "@/lib/format";
import { getValidSupabaseSession } from "@/lib/supabase";
import { useEffect, useState } from "react";

type SnapshotData = { batch: any; partners: any[]; segments: any[]; transfers: any[] };

function partnerName(value: unknown, partners: any[]) {
  const id = String(value || "");
  return partners.find((item) => item.partner_id === id || item.id === id)?.partner_display_name_snapshot || "未知合伙人";
}

function segmentShares(value: unknown, partners: any[]) {
  if (!Array.isArray(value)) return [];
  return value.map((share: any, index: number) => ({
    name: share.displayName || share.display_name || partnerName(share.partnerId || share.partner_id, partners) || `合伙人${index + 1}`,
    percentage: Number(share.percentage || 0),
    legacyCode: share.legacyCode || share.legacy_code || partners.find((item) => item.partner_id === (share.partnerId || share.partner_id))?.legacy_code_snapshot || null,
  }));
}

export default function PartnerSettlementSnapshotPage({ params }: { params: Promise<{ id: string }> }) {
  const access = useAccountAccess();
  const [data, setData] = useState<SnapshotData | null>(null);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    void params.then(async ({ id }) => {
      const session = await getValidSupabaseSession();
      if (!session) { setMessage("登录已失效"); return; }
      try {
        const response = await fetch(`/api/partner-settlements/${id}`, { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "加载结算快照失败");
        setData(payload);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "加载结算快照失败");
      }
    });
  }, [params]);

  async function reverse() {
    if (!data || !reason.trim()) return;
    const batch = data.batch;
    if (!window.confirm(`确认撤销该结算快照吗？\n\n房源：${batch.property_name_snapshot || "房源名称未保存"}\n期间：${batch.period_start} 至 ${batch.period_end}\n净利润：${euro(Number(batch.net_profit))}\n确认时间：${new Date(batch.confirmed_at).toLocaleString("zh-CN")}`)) return;
    const session = await getValidSupabaseSession();
    if (!session) { setMessage("登录已失效"); return; }
    const response = await fetch(`/api/partner-settlements/${batch.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ reason: reason.trim() }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) { setMessage(payload.error || "撤销失败，请稍后重试"); return; }
    setMessage("结算已撤销");
    setData({ ...data, batch: { ...batch, status: "reversed", reversal_reason: reason.trim(), reversed_at: new Date().toISOString() } });
  }

  if (message === "登录已失效" && !data) return <AppLayout title="登录已失效"><section className="card panel auth-expired-state"><h2 className="panel-title">登录已失效</h2><p className="muted">请重新登录后继续查看结算快照。</p><a className="btn primary" href={`/login?returnTo=${encodeURIComponent("/partner-settlements")}`}>重新登录</a></section></AppLayout>;
  if (message && !data) return <AppLayout title="结算快照"><section className="card panel"><p className="error-text">{message}</p></section></AppLayout>;
  if (!data) return <AppLayout title="结算快照"><section className="card panel"><p className="muted">加载中…</p></section></AppLayout>;

  const batch = data.batch;
  const propertyName = batch.property_name_snapshot || "房源名称未保存";
  const confirmedBy = batch.confirmed_by_display_name_snapshot || "确认账号名称未保存";

  return <AppLayout title="结算快照" description="只读取确认时保存的不可变结算数据。">
    <section className="card panel settlement-snapshot-page">
      <div className="panel-header"><div><h2 className="panel-title">结算快照</h2><p className="muted">{propertyName}</p></div><a className="btn compact" href="/partner-settlements">返回历史</a></div>
      <div className="snapshot-hero"><strong>{batch.period_start} 至 {batch.period_end}</strong><span className={`status-badge ${batch.status === "confirmed" ? "success" : "muted-badge"}`}>{batch.status === "confirmed" ? "已结算" : "已撤销"}</span></div>
      <div className="snapshot-meta"><span>确认时间：{new Date(batch.confirmed_at).toLocaleString("zh-CN")}</span><span>确认人：{confirmedBy}{!batch.confirmed_by_display_name_snapshot ? <small className="muted">（账号标识已保留）</small> : null}</span>{batch.reversed_at ? <span>撤销时间：{new Date(batch.reversed_at).toLocaleString("zh-CN")}</span> : null}{batch.reversed_by_account_id ? <span>撤销账号：已记录</span> : null}{batch.reversal_reason ? <span>撤销原因：{batch.reversal_reason}</span> : null}{batch.note ? <span>备注：{batch.note}</span> : null}</div>
      <div className="compact-report-card"><div>总收入 <strong>{euro(Number(batch.total_income))}</strong></div><div>总支出 <strong>{euro(Number(batch.total_expense))}</strong></div><div>净利润 <strong className={Number(batch.net_profit) < 0 ? "danger-text" : "profit"}>{euro(Number(batch.net_profit))}</strong></div></div>

      <section className="snapshot-section"><h3>比例分段</h3>{data.segments.map((segment, index) => <article className="snapshot-segment" key={segment.id}><h4>比例分段 {index + 1}</h4><strong>{segment.segment_start} 至 {segment.segment_end}</strong><div className="snapshot-share-list">{segmentShares(segment.shares_snapshot, data.partners).map((share: any, shareIndex: number) => <span key={`${share.name}-${shareIndex}`}>{share.name}：{share.percentage}%{share.legacyCode ? <small className="muted">（兼容归属代码：{share.legacyCode}）</small> : null}</span>)}</div><div className="snapshot-segment-amounts"><span>收入 {euro(Number(segment.total_income))}</span><span>支出 {euro(Number(segment.total_expense))}</span><span>净利润 {euro(Number(segment.net_profit))}</span></div></article>)}</section>

      <section className="snapshot-section"><h3>最终转账建议</h3>{data.transfers.length ? data.transfers.map((transfer) => <p key={transfer.id}>{transfer.from_name_snapshot} 转给 {transfer.to_name_snapshot}：{euro(Number(transfer.amount))} {transfer.currency || "EUR"}</p>) : <p className="muted">本次无需相互转账</p>}</section>

      {batch.status === "confirmed" && access.isOwner ? <section className="snapshot-reversal"><h3>撤销结算</h3><p className="muted">撤销后原快照仍永久保留，并记录撤销原因。</p><div className="field"><label>撤销原因（必填）</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请填写撤销原因" /></div><button className="btn danger" type="button" disabled={!reason.trim()} onClick={() => void reverse()}>撤销结算</button></section> : null}
      {message ? <p className="success-text">{message}</p> : null}

      <details className="snapshot-section technical-info"><summary>技术信息</summary><div className="snapshot-meta"><span>快照编号：{batch.id}</span><span>房源内部编号：{batch.property_id}</span><span>确认账号标识：{batch.confirmed_by_account_id}</span><span>数据状态：{batch.status}</span></div></details>
    </section>
  </AppLayout>;
}
