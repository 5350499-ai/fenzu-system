"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { getCurrentPropertySharePlan, getPartners, getPropertyPartnerShares, type PartnerWorkspaceData, validatePartnerPercentages } from "@/lib/partners";
import { getValidSupabaseSession } from "@/lib/supabase";
import { Plus, Save, Trash2, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function nextMonthFirst() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

export default function PartnersPage() {
  const access = useAccountAccess();
  const [data, setData] = useState<PartnerWorkspaceData | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftSortOrders, setDraftSortOrders] = useState<Record<string, string>>({});
  const [draftPercentages, setDraftPercentages] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthFirst);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  async function reload() {
    setLoading(true);
    try {
      const next = await getPartners();
      setData(next);
      setSelectedPropertyId((current) => current || next.properties[0]?.id || "");
      setDraftNames(Object.fromEntries(next.partners.map((partner) => [partner.id, partner.displayName])));
      setDraftSortOrders(Object.fromEntries(next.partners.map((partner) => [partner.id, String(partner.sortOrder)])));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void reload(); }, []);

  const activePartners = useMemo(() => (data?.partners || []).filter((partner) => partner.isActive), [data]);
  const currentPlan = useMemo(() => data && selectedPropertyId ? getCurrentPropertySharePlan(data.shares, selectedPropertyId) : [], [data, selectedPropertyId]);
  const futurePlans = useMemo(() => {
    if (!data || !selectedPropertyId) return [];
    const today = new Date().toISOString().slice(0, 10);
    const byDate = new Map<string, typeof data.shares>();
    getPropertyPartnerShares(data.shares, selectedPropertyId).filter((share) => share.effectiveFrom > today).forEach((share) => byDate.set(share.effectiveFrom, [...(byDate.get(share.effectiveFrom) || []), share]));
    return [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right));
  }, [data, selectedPropertyId]);

  useEffect(() => {
    if (!data || !selectedPropertyId) return;
    const values = Object.fromEntries(activePartners.map((partner) => [partner.id, String(currentPlan.find((share) => share.partnerId === partner.id)?.percentage ?? 0)]));
    setDraftPercentages(values);
  }, [data, selectedPropertyId, activePartners, currentPlan]);

  const totals = validatePartnerPercentages(activePartners.map((partner) => draftPercentages[partner.id] || 0));

  async function request(path: string, init: RequestInit) {
    const session = await getValidSupabaseSession();
    if (!session?.access_token) throw new Error("登录已失效，请重新登录");
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, ...(init.headers || {}) } });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || "保存失败");
    return body;
  }

  async function savePartner(id: string) {
    setWorking(true); setMessage("");
    try { await request(`/api/partners/${id}`, { method: "PATCH", body: JSON.stringify({ displayName: draftNames[id], sortOrder: Number(draftSortOrders[id] || 0) }) }); await reload(); setMessage("合伙人资料已保存"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setWorking(false); }
  }

  async function togglePartner(id: string, isActive: boolean) {
    setWorking(true); setMessage("");
    try { await request(`/api/partners/${id}`, { method: "PATCH", body: JSON.stringify({ isActive }) }); await reload(); setMessage("状态已更新"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setWorking(false); }
  }

  async function addPartner() {
    setWorking(true); setMessage("");
    try { await request("/api/partners", { method: "POST", body: JSON.stringify({ displayName: newName }) }); setNewName(""); await reload(); setMessage("合伙人已新增"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "新增失败"); }
    finally { setWorking(false); }
  }

  async function removePartner(id: string) {
    if (!window.confirm("确认删除这位没有业务关联的合伙人吗？")) return;
    setWorking(true); setMessage("");
    try { await request(`/api/partners/${id}`, { method: "DELETE" }); await reload(); setMessage("合伙人已删除"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); }
    finally { setWorking(false); }
  }

  async function saveSharePlan() {
    if (!selectedPropertyId || !totals.valid) return;
    setWorking(true); setMessage("");
    try {
      await request("/api/partners/shares", { method: "POST", body: JSON.stringify({ propertyId: selectedPropertyId, effectiveFrom, percentages: activePartners.map((partner) => ({ partnerId: partner.id, percentage: Number(draftPercentages[partner.id] || 0) })) }) });
      await reload(); setMessage("房源利润比例计划已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "比例保存失败"); }
    finally { setWorking(false); }
  }

  if (!access.isOwner) return <AppLayout title="合伙人管理"><section className="card panel"><p className="muted">仅Owner可以管理合伙人和房源利润比例。</p></section></AppLayout>;

  return (
    <AppLayout title="合伙人管理" description="管理工作区合伙人名称，以及各房源的利润分配比例。">
      <section className="card panel partner-management-panel">
        <div className="panel-header"><div><h2 className="panel-title">工作区合伙人</h2><p className="muted">支持1—5位启用合伙人；旧账目的A/B归属暂不改变。</p></div></div>
        {loading ? <p className="muted">正在加载…</p> : <>
          <div className="partner-list">
            {(data?.partners || []).map((partner) => (
              <div className="partner-management-row" key={partner.id}>
                <span className="partner-management-icon"><UserRound size={17} /></span>
                <div className="partner-management-main">
                  <input aria-label={`${partner.displayName}显示名称`} value={draftNames[partner.id] ?? partner.displayName} onChange={(event) => setDraftNames((current) => ({ ...current, [partner.id]: event.target.value }))} />
                  <span className="muted partner-management-meta">{partner.legacyCode ? `兼容归属 ${partner.legacyCode}` : "新合伙人"} · 参与 {partner.propertyCount} 套房源</span>
                </div>
                <input className="partner-sort-input" aria-label={`${partner.displayName}排序`} type="number" min="0" value={draftSortOrders[partner.id] ?? partner.sortOrder} onChange={(event) => setDraftSortOrders((current) => ({ ...current, [partner.id]: event.target.value }))} />
                <span className={`status-badge ${partner.isActive ? "success" : "muted-badge"}`}>{partner.isActive ? "启用" : "停用"}</span>
                <button className="btn compact" disabled={working} onClick={() => void savePartner(partner.id)} type="button"><Save size={15} />保存</button>
                <button className="btn compact" disabled={working || (partner.isActive && activePartners.length <= 1)} onClick={() => void togglePartner(partner.id, !partner.isActive)} type="button">{partner.isActive ? "停用" : "启用"}</button>
                {!partner.legacyCode && partner.propertyCount === 0 ? <button className="btn compact danger" disabled={working} onClick={() => void removePartner(partner.id)} type="button"><Trash2 size={15} />删除</button> : null}
              </div>
            ))}
          </div>
          <div className="partner-add-row"><input placeholder="新合伙人名称" value={newName} onChange={(event) => setNewName(event.target.value)} /><button className="btn primary" disabled={working || !newName.trim() || activePartners.length >= 5} onClick={() => void addPartner()} type="button"><Plus size={16} />新增合伙人</button></div>
        </>}
      </section>

      <section className="card panel partner-management-panel">
        <div className="panel-header"><div><h2 className="panel-title">房源利润比例</h2><p className="muted">新计划默认从下月1日生效，不覆盖已经生效的历史区间。</p></div></div>
        <div className="field"><label htmlFor="partner-property">选择房源</label><select id="partner-property" value={selectedPropertyId} onChange={(event) => setSelectedPropertyId(event.target.value)}>{(data?.properties || []).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
        {selectedPropertyId ? <>
          <div className="partner-share-grid">{activePartners.map((partner) => <div className="field" key={partner.id}><label>{partner.displayName}</label><div className="partner-percent-input"><input type="number" min="0" max="100" step="0.01" value={draftPercentages[partner.id] ?? "0"} onChange={(event) => setDraftPercentages((current) => ({ ...current, [partner.id]: event.target.value }))} /><span>%</span></div></div>)}</div>
          <div className={`partner-total ${totals.valid ? "valid" : "invalid"}`}>当前合计：{totals.total.toFixed(2)}% {totals.valid ? "" : "（必须等于100%）"}</div>
          <div className="partner-share-save"><div className="field"><label htmlFor="share-effective-from">生效日期</label><input id="share-effective-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></div><button className="btn primary" disabled={working || !totals.valid} onClick={() => void saveSharePlan()} type="button"><Save size={16} />保存比例计划</button></div>
          <div className="partner-plan-list"><h3>当前与未来计划</h3>{currentPlan.length ? <p>当前（{currentPlan[0].effectiveFrom}）：{currentPlan.map((share) => `${data?.partners.find((partner) => partner.id === share.partnerId)?.displayName || "未知"} ${share.percentage}%`).join(" · ")}</p> : <p className="muted">暂无当前比例计划</p>}{futurePlans.map(([date, shares]) => <p key={date}>未来（{date}）：{shares.map((share) => `${data?.partners.find((partner) => partner.id === share.partnerId)?.displayName || "未知"} ${share.percentage}%`).join(" · ")}</p>)}</div>
        </> : <p className="muted">暂无可配置房源。</p>}
      </section>
      {message ? <p className="partner-feedback" role="status">{message}</p> : null}
    </AppLayout>
  );
}
