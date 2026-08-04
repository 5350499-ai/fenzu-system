"use client";

import { AppLayout } from "@/components/app-layout";
import { useEffect, useState } from "react";
import { euro } from "@/lib/format";

type Batch = { id: string; property_id: string; period_start: string; period_end: string; status: "confirmed" | "reversed"; total_income: number; total_expense: number; net_profit: number; confirmed_at: string; };
export default function PartnerSettlementHistoryPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [propertyId, setPropertyId] = useState("all");
  const [properties, setProperties] = useState<Array<{ id: string; name: string }>>([]);
  const [message, setMessage] = useState("");
  useEffect(() => { void fetch("/api/partner-settlements", { cache: "no-store" }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "加载结算历史失败"); setBatches(payload.batches || []); }).catch((error) => setMessage(error.message)); void fetch("/api/partners", { cache: "no-store" }).then((response) => response.json()).then((payload) => setProperties(payload.properties || [])).catch(() => undefined); }, []);
  const filtered = propertyId === "all" ? batches : batches.filter((batch) => batch.property_id === propertyId);
  return <AppLayout title="结算历史" description="查看不可变结算快照及撤销状态。"><section className="card panel"><div className="panel-header"><div><h2 className="panel-title">结算历史</h2><p className="muted">已确认快照不会随合伙人改名或比例调整而改变。</p></div><a className="btn compact" href="/partnership-settlement">返回结算</a></div><div className="field"><label>房源筛选</label><select value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="all">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>{message ? <p className="error-text">{message}</p> : null}<div className="settlement-detail-list">{filtered.map((batch) => <a className="settlement-history-row" href={`/partner-settlements/${batch.id}`} key={batch.id}><span>{batch.period_start} 至 {batch.period_end}</span><span>{properties.find((property) => property.id === batch.property_id)?.name || batch.property_id}</span><span>收入 {euro(Number(batch.total_income))}</span><span>支出 {euro(Number(batch.total_expense))}</span><strong className={Number(batch.net_profit) < 0 ? "danger-text" : "profit"}>净利润 {euro(Number(batch.net_profit))}</strong><span>{batch.status === "confirmed" ? "已确认" : "已撤销"}</span></a>)}{!filtered.length ? <p className="muted">暂无结算记录</p> : null}</div></section></AppLayout>;
}
