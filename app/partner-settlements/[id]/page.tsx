"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { euro } from "@/lib/format";
import { getValidSupabaseSession } from "@/lib/supabase";
import { useEffect, useState } from "react";
import { DangerButton, DetailCard, DetailGrid, DetailItem, MoneyValue } from "@/components/ui";

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

function segmentLabel(segment: any, fallbackPropertyName: string) {
  const segmentPropertyName = String(
    segment.property_name_snapshot || segment.propertyName || segment.property_name || "",
  ).trim();
  if (segmentPropertyName) return segmentPropertyName;
  return fallbackPropertyName === "房源名称未保存" ? "结算分段" : fallbackPropertyName;
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
      <DetailCard className="snapshot-basic-card" title="结算基本信息" subtitle={`${batch.period_start} ～ ${batch.period_end}`}><div className="snapshot-status-line"><span className={`status-badge ${batch.status === "confirmed" ? "success" : "muted-badge"}`}>{batch.status === "confirmed" ? "已结算" : "已撤销"}</span></div><DetailGrid><DetailItem label="房源" value={propertyName} /><DetailItem label="确认时间" value={new Date(batch.confirmed_at).toLocaleString("zh-CN")} /><DetailItem label="确认人" value={<>{confirmedBy}{!batch.confirmed_by_display_name_snapshot ? <small className="muted">（账号标识已保留）</small> : null}</>} />{batch.reversed_at ? <DetailItem label="撤销时间" value={new Date(batch.reversed_at).toLocaleString("zh-CN")} /> : null}{batch.reversed_by_account_id ? <DetailItem label="撤销账号" value="已记录" /> : null}{batch.reversal_reason ? <DetailItem label="撤销原因" value={batch.reversal_reason} /> : null}{batch.note ? <DetailItem label="备注" value={batch.note} /> : null}</DetailGrid></DetailCard>
      <DetailCard title="汇总金额"><DetailGrid><DetailItem label="收入" value={<MoneyValue value={Number(batch.total_income)} tone="income" />} tone="income" /><DetailItem label="支出" value={<MoneyValue value={Number(batch.total_expense)} tone="expense" />} tone="expense" /><DetailItem label="净利润" value={<MoneyValue value={Number(batch.net_profit)} tone={Number(batch.net_profit) < 0 ? "loss" : "profit"} />} tone={Number(batch.net_profit) < 0 ? "loss" : "profit"} /></DetailGrid></DetailCard>

      <DetailCard title="结算明细">{data.segments.map((segment) => <article className="snapshot-segment" key={segment.id}><h4>{segmentLabel(segment, propertyName)}</h4><p className="snapshot-period">{segment.segment_start} ～ {segment.segment_end}</p><div className="snapshot-share-list">{segmentShares(segment.shares_snapshot, data.partners).map((share: any, shareIndex: number) => <span key={`${share.name}-${shareIndex}`}>{share.name}（{share.percentage}%）{share.legacyCode ? <small className="muted">兼容归属代码：{share.legacyCode}</small> : null}</span>)}</div><DetailGrid><DetailItem label="收入" value={<MoneyValue value={Number(segment.total_income)} tone="income" />} tone="income" /><DetailItem label="支出" value={<MoneyValue value={Number(segment.total_expense)} tone="expense" />} tone="expense" /><DetailItem label="净利润" value={<MoneyValue value={Number(segment.net_profit)} tone={Number(segment.net_profit) < 0 ? "loss" : "profit"} />} tone={Number(segment.net_profit) < 0 ? "loss" : "profit"} /></DetailGrid></article>)}</DetailCard>

      <DetailCard title="最终转账建议">{data.transfers.length ? data.transfers.map((transfer) => <p className="snapshot-transfer-line" key={transfer.id}><strong>{transfer.from_name_snapshot}</strong> 转给 <strong>{transfer.to_name_snapshot}</strong><MoneyValue value={Number(transfer.amount)} tone="loss" /></p>) : <p className="muted">本次无需相互转账</p>}</DetailCard>

      {batch.status === "confirmed" && (access.isOwner || access.isFreeSingle) ? <DetailCard className="snapshot-reversal" title="撤销结算" subtitle="原快照将永久保留，并记录撤销原因。"><div className="field"><label>撤销原因（必填）</label><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="请填写撤销原因" /></div><DangerButton type="button" disabled={!reason.trim()} onClick={() => void reverse()}>撤销结算</DangerButton></DetailCard> : null}
      {message ? <p className="success-text">{message}</p> : null}

      <details className="snapshot-section technical-info"><summary>技术信息</summary><div className="snapshot-meta"><span>快照编号：{batch.id}</span><span>房源内部编号：{batch.property_id}</span><span>确认账号标识：{batch.confirmed_by_account_id}</span><span>数据状态：{batch.status}</span></div></details>
    </section>
  </AppLayout>;
}
