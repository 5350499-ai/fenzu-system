"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { getCurrentPropertySharePlan, getPartners, getPropertyPartnerShares, invalidatePartnersCache, type PartnerPropertyShare, type PartnerWorkspaceData, validatePartnerPercentages } from "@/lib/partners";
import { getValidSupabaseSession } from "@/lib/supabase";
import { SectionCard } from "@/components/ui";
import { CalendarClock, Edit3, Plus, Save, Trash2, UserRound, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function nextMonthFirst() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

function groupPlans(shares: PartnerPropertyShare[], propertyId: string, futureOnly: boolean) {
  const today = new Date().toISOString().slice(0, 10);
  const grouped = new Map<string, PartnerPropertyShare[]>();
  getPropertyPartnerShares(shares, propertyId)
    .filter((share) => futureOnly ? share.effectiveFrom > today : share.effectiveFrom <= today)
    .forEach((share) => grouped.set(share.effectiveFrom, [...(grouped.get(share.effectiveFrom) || []), share]));
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right));
}

export default function PartnersPage() {
  const access = useAccountAccess();
  const [data, setData] = useState<PartnerWorkspaceData | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftSortOrders, setDraftSortOrders] = useState<Record<string, string>>({});
  const [draftPercentages, setDraftPercentages] = useState<Record<string, string>>({});
  const [effectiveFrom, setEffectiveFrom] = useState(nextMonthFirst);
  const [editingPlanDate, setEditingPlanDate] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [firstStartDate, setFirstStartDate] = useState("");

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

  useEffect(() => { if (access.ready && (access.isOwner || access.isFreeSingle)) void reload(); }, [access.isFreeSingle, access.ready, access.isOwner]);

  const activePartners = useMemo(() => (data?.partners || []).filter((partner) => partner.isActive).sort((left, right) => left.sortOrder - right.sortOrder), [data]);
  const currentPlan = useMemo(() => data && selectedPropertyId ? getCurrentPropertySharePlan(data.shares, selectedPropertyId) : [], [data, selectedPropertyId]);
  const futurePlans = useMemo(() => data && selectedPropertyId ? groupPlans(data.shares, selectedPropertyId, true) : [], [data, selectedPropertyId]);

  useEffect(() => {
    if (!data || !selectedPropertyId || editingPlanDate) return;
    const ids = currentPlan.map((share) => share.partnerId).filter((id) => activePartners.some((partner) => partner.id === id));
    setSelectedPartnerIds(ids);
    setDraftPercentages(Object.fromEntries(activePartners.map((partner) => [partner.id, String(currentPlan.find((share) => share.partnerId === partner.id)?.percentage ?? 0)])));
  }, [data, selectedPropertyId, activePartners, currentPlan, editingPlanDate]);

  useEffect(() => { setFirstStartDate(currentPlan[0]?.effectiveFrom || ""); }, [currentPlan]);

  const totals = validatePartnerPercentages(selectedPartnerIds.map((id) => draftPercentages[id] || 0));

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
    try { await request(`/api/partners/${id}`, { method: "PATCH", body: JSON.stringify({ displayName: draftNames[id], sortOrder: Number(draftSortOrders[id] || 0) }) }); await invalidatePartnersCache(); setEditingId(null); await reload(); setMessage("合伙人资料已保存"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setWorking(false); }
  }

  async function togglePartner(id: string, isActive: boolean) {
    const partner = data?.partners.find((item) => item.id === id);
    if (!isActive) {
      const futureCount = partner?.futurePropertyCount || 0;
      const text = futureCount > 0
        ? `该合伙人存在${futureCount}套房源的未来分红计划。停用后将取消这些未来计划，历史和当前已生效方案不变。确认继续吗？`
        : "确认停用这位合伙人吗？停用后不能加入新的房源比例计划。";
      if (!window.confirm(text)) return;
    }
    setWorking(true); setMessage("");
    try { await request(`/api/partners/${id}`, { method: "PATCH", body: JSON.stringify({ isActive, ...(isActive ? {} : { cancelFuturePlans: true }) }) }); await reload(); setMessage(isActive ? "合伙人已启用" : "合伙人已停用，相关未来计划已取消"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setWorking(false); }
  }

  async function addPartner() {
    setWorking(true); setMessage("");
    try { await request("/api/partners", { method: "POST", body: JSON.stringify({ displayName: newName }) }); setNewName(""); setShowAddForm(false); await reload(); setMessage("合伙人已新增，默认未参与任何房源"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "新增失败"); }
    finally { setWorking(false); }
  }

  async function removePartner(id: string) {
    const partner = data?.partners.find((item) => item.id === id);
    const futureOnly = Boolean(partner && partner.futurePropertyCount > 0 && partner.currentPropertyCount === 0);
    if (!window.confirm(futureOnly ? "确认取消该合伙人的未来比例计划并永久删除吗？历史已生效方案不会被修改。" : "确认删除这位没有业务关联的合伙人吗？")) return;
    setWorking(true); setMessage("");
    try { await request(`/api/partners/${id}`, { method: "DELETE" }); await reload(); setMessage("合伙人已删除"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "删除失败"); }
    finally { setWorking(false); }
  }

  function editFuturePlan(date: string, shares: PartnerPropertyShare[]) {
    setEditingPlanDate(date);
    setEffectiveFrom(date);
    const ids = shares.map((share) => share.partnerId);
    setSelectedPartnerIds(ids.filter((id) => activePartners.some((partner) => partner.id === id)));
    setDraftPercentages(Object.fromEntries(activePartners.map((partner) => [partner.id, String(shares.find((share) => share.partnerId === partner.id)?.percentage ?? 0)])));
  }

  function resetPlanEditor() {
    setEditingPlanDate(null);
    setEffectiveFrom(nextMonthFirst());
  }

  async function cancelFuturePlan(propertyId: string, date: string) {
    const propertyName = data?.properties.find((property) => property.id === propertyId)?.name || "当前房源";
    const plan = futurePlans.find(([planDate]) => planDate === date)?.[1] || [];
    const planText = plan.map((share) => `${data?.partners.find((partner) => partner.id === share.partnerId)?.displayName || "未知"}${share.percentage}%`).join("、");
    const currentText = currentPlan.map((share) => `${data?.partners.find((partner) => partner.id === share.partnerId)?.displayName || "未知"}${share.percentage}%`).join("、") || "暂无当前方案";
    if (!window.confirm(`房源：${propertyName}\n生效日期：${date}\n当前计划：${planText}\n取消后沿用：${currentText}\n\n取消未来计划会取消该生效日的整套分红方案，当前已生效方案将继续沿用。若只想移除某位合伙人，请编辑未来计划后取消勾选该合伙人。\n\n确认取消吗？`)) return;
    setWorking(true); setMessage("");
    try { await request("/api/partners/shares", { method: "DELETE", body: JSON.stringify({ propertyId, effectiveFrom: date }) }); resetPlanEditor(); await reload(); setMessage("未来比例计划已取消"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "取消失败"); }
    finally { setWorking(false); }
  }

  async function saveSharePlan() {
    if (!selectedPropertyId || !totals.valid || selectedPartnerIds.length < 1) return;
    setWorking(true); setMessage("");
    try {
      await request("/api/partners/shares", { method: "POST", body: JSON.stringify({ propertyId: selectedPropertyId, effectiveFrom, percentages: selectedPartnerIds.map((partnerId) => ({ partnerId, percentage: Number(draftPercentages[partnerId] || 0) })) }) });
      resetPlanEditor(); await reload(); setMessage("房源利润比例计划已保存");
    } catch (error) { setMessage(error instanceof Error ? error.message : "比例保存失败"); }
    finally { setWorking(false); }
  }

  async function adjustFirstStartDate() {
    if (!selectedPropertyId || !currentPlan.length || !firstStartDate || firstStartDate >= currentPlan[0].effectiveFrom) return;
    if (!window.confirm(`调整首个比例方案起始日？\n\n原起始日：${currentPlan[0].effectiveFrom}\n新起始日：${firstStartDate}\n比例保持不变，不会修改原始账目或已确认快照。`)) return;
    setWorking(true); setMessage("");
    try { await request("/api/partners/shares", { method: "PATCH", body: JSON.stringify({ propertyId: selectedPropertyId, effectiveFrom: firstStartDate }) }); await reload(); setMessage("首个比例方案起始日已保存"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "起始日保存失败"); }
    finally { setWorking(false); }
  }

  if (!access.ready) return <AppLayout title="合伙人管理"><section className="card panel"><p className="muted">正在检查登录状态…</p></section></AppLayout>;
  if (!access.isOwner && !access.isFreeSingle) return <AppLayout title="合伙人管理"><section className="card panel"><p className="muted">当前账号没有成员管理权限。</p></section></AppLayout>;
  if (access.isFreeSingle) {
    const self = activePartners[0];
    return <AppLayout title="成员管理" description="免费版使用一名本人成员，所有业务归属和利润比例保持统一。">
      <SectionCard className="partner-management-panel">
        <div className="panel-header"><div><h2 className="panel-title">本人成员</h2><p className="muted">免费版仅支持 1 名成员，本人固定占比 100%。</p></div></div>
        {loading ? <p className="muted">正在加载成员资料…</p> : self ? <div className="partner-management-row"><span className="partner-management-icon"><UserRound size={17} /></span><div className="partner-management-main">{editingId === self.id ? <input aria-label="成员名称" value={draftNames[self.id] ?? self.displayName} onChange={(event) => setDraftNames((current) => ({ ...current, [self.id]: event.target.value }))} /> : <strong>{self.displayName}</strong>}<span className="muted partner-management-meta">本人 · 100% · 当前唯一成员</span></div><div className="partner-management-actions">{editingId === self.id ? <><button className="btn compact" disabled={working} onClick={() => void savePartner(self.id)} type="button"><Save size={15} />保存</button><button className="btn compact" disabled={working} onClick={() => setEditingId(null)} type="button"><X size={15} />取消</button></> : <button className="btn compact" disabled={working} onClick={() => setEditingId(self.id)} type="button"><Edit3 size={15} />编辑名称</button>}</div></div> : <p className="error-text">未能加载本人成员，请刷新后重试。</p>}
      </SectionCard>
      <SectionCard className="partner-management-panel"><h2 className="panel-title">多人协作</h2><p className="muted">新增成员、调整多人比例和多人分账为订阅功能。升级后会直接沿用当前归属记录，无需迁移历史数据。</p><button className="btn" type="button" onClick={() => setMessage("新增成员为订阅功能；免费版可继续管理本人和 100% 比例。")}><Plus size={16} />新增成员</button>{message ? <p className="partner-feedback" role="status">{message}</p> : null}</SectionCard>
    </AppLayout>;
  }

  return (
    <AppLayout title="合伙人管理" description="管理合伙人姓名、状态及各房源利润比例。">
      <SectionCard className="partner-management-panel">
        <div className="panel-header partner-panel-header"><div><h2 className="panel-title">工作区合伙人</h2><p className="muted">支持1—10位启用合伙人；新增合伙人默认不参与任何房源。</p></div><button className="btn primary" disabled={working || activePartners.length >= 10} onClick={() => setShowAddForm((current) => !current)} type="button"><Plus size={16} />{showAddForm ? "取消新增" : "新增合伙人"}</button></div>
        {loading ? <p className="muted">正在加载…</p> : <>
          <div className="partner-list">
            {(data?.partners || []).map((partner) => {
              const canDelete = !partner.legacyCode && partner.currentPropertyCount === 0;
              const deleteLabel = partner.futurePropertyCount > 0 ? "取消未来计划并删除" : "删除";
              return <div className="partner-management-row" key={partner.id}>
                <span className="partner-management-icon"><UserRound size={17} /></span>
                <div className="partner-management-main">
                  {editingId === partner.id ? <input aria-label={`${partner.displayName}显示名称`} value={draftNames[partner.id] ?? partner.displayName} onChange={(event) => setDraftNames((current) => ({ ...current, [partner.id]: event.target.value }))} /> : <strong>{partner.displayName}</strong>}
                  <span className="muted partner-management-meta">{partner.legacyCode ? `兼容归属 ${partner.legacyCode}` : "新合伙人"} · 当前参与 {partner.currentPropertyCount} 套 · 未来参与 {partner.futurePropertyCount} 套</span>
                  {(data?.nameHistory || []).some((item) => item.partnerId === partner.id) ? <details className="partner-name-history"><summary>名称历史</summary>{(data?.nameHistory || []).filter((item) => item.partnerId === partner.id).map((item) => <p key={item.id} className="muted">{item.oldDisplayName} → {item.newDisplayName} · {new Date(item.changedAt).toLocaleString("zh-CN")}</p>)}</details> : null}
                </div>
                {editingId === partner.id ? <input className="partner-sort-input" aria-label={`${partner.displayName}排序`} type="number" min="0" value={draftSortOrders[partner.id] ?? partner.sortOrder} onChange={(event) => setDraftSortOrders((current) => ({ ...current, [partner.id]: event.target.value }))} /> : <span className="partner-sort-label">排序 {partner.sortOrder}</span>}
                <span className={`status-badge ${partner.isActive ? "success" : "muted-badge"}`}>{partner.isActive ? "启用" : "停用"}</span>
                <div className="partner-management-actions">
                  {editingId === partner.id ? <><button className="btn compact" disabled={working} onClick={() => void savePartner(partner.id)} type="button"><Save size={15} />保存</button><button className="btn compact" disabled={working} onClick={() => setEditingId(null)} type="button"><X size={15} />取消</button></> : <button className="btn compact" disabled={working} onClick={() => setEditingId(partner.id)} type="button"><Edit3 size={15} />编辑</button>}
                  <button className="btn compact" disabled={working || (partner.isActive && activePartners.length <= 1)} onClick={() => void togglePartner(partner.id, !partner.isActive)} type="button">{partner.isActive ? "停用" : "启用"}</button>
                  {canDelete ? <button className="btn compact danger" disabled={working} onClick={() => void removePartner(partner.id)} type="button"><Trash2 size={15} />{deleteLabel}</button> : <span className="partner-delete-hint">{partner.legacyCode ? "历史A/B只能停用" : "已有当前或历史比例，只能停用"}</span>}
                </div>
              </div>;
            })}
          </div>
          {showAddForm ? <div className="partner-add-row"><input autoFocus placeholder="新合伙人名称" value={newName} onChange={(event) => setNewName(event.target.value)} /><button className="btn primary" disabled={working || !newName.trim() || activePartners.length >= 10} onClick={() => void addPartner()} type="button"><Plus size={16} />确认新增</button></div> : null}
        </>}
      </SectionCard>

      <SectionCard className="partner-management-panel">
        <div className="panel-header"><div><h2 className="panel-title">房源利润比例</h2><p className="muted">先选择参与者，再填写比例。新计划默认从下月1日生效；同一天保存会替换未生效计划。</p></div></div>
        <div className="field"><label htmlFor="partner-property">选择房源</label><select id="partner-property" value={selectedPropertyId} onChange={(event) => { setSelectedPropertyId(event.target.value); resetPlanEditor(); }}>{(data?.properties || []).map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></div>
        {selectedPropertyId ? <>
          <div className="partner-plan-list"><h3>当前有效方案</h3>{currentPlan.length ? <><p>{currentPlan.map((share) => `${data?.partners.find((partner) => partner.id === share.partnerId)?.displayName || "未知"} ${share.percentage}%`).join(" · ")}（{currentPlan[0].effectiveFrom}）</p><div className="partner-first-plan-adjust"><label>调整首个方案起始日</label><input type="date" value={firstStartDate} max={currentPlan[0].effectiveFrom} onChange={(event) => setFirstStartDate(event.target.value)} /><button className="btn compact" type="button" disabled={working || !firstStartDate || firstStartDate >= currentPlan[0].effectiveFrom} onClick={() => void adjustFirstStartDate()}>保存起始日</button><span className="muted">参与人和比例保持不变；不会修改原始账目或已确认快照。</span></div></> : <p className="muted">暂无当前比例计划</p>}</div>
          <div className="partner-plan-list"><h3>未来计划</h3>{futurePlans.length ? futurePlans.map(([date, shares]) => <div className="partner-future-plan" key={date}><p><CalendarClock size={15} /> {date}：{shares.map((share) => `${data?.partners.find((partner) => partner.id === share.partnerId)?.displayName || "未知"} ${share.percentage}%`).join(" · ")}</p><div className="partner-plan-actions"><button className="btn compact" disabled={working} onClick={() => editFuturePlan(date, shares)} type="button"><Edit3 size={14} />编辑</button><button className="btn compact danger" disabled={working} onClick={() => void cancelFuturePlan(selectedPropertyId, date)} type="button"><X size={14} />取消未来计划</button></div></div>) : <p className="muted">暂无未来比例计划</p>}</div>
          <div className="partner-plan-editor"><h3>{editingPlanDate ? `编辑${editingPlanDate}未来计划` : "新建未来比例计划"}</h3><div className="partner-participant-grid">{activePartners.map((partner) => <label className="partner-participant" key={partner.id}><input type="checkbox" checked={selectedPartnerIds.includes(partner.id)} onChange={(event) => setSelectedPartnerIds((current) => event.target.checked ? [...current, partner.id] : current.filter((id) => id !== partner.id))} /><span>{partner.displayName}</span></label>)}</div><p className="muted partner-form-help">未勾选的合伙人不会写入该房源方案；新增合伙人默认不参与。选中的0%等同暂不参与分配。</p><div className="partner-share-grid">{activePartners.filter((partner) => selectedPartnerIds.includes(partner.id)).map((partner) => <div className="field" key={partner.id}><label>{partner.displayName}比例</label><div className="partner-percent-input"><input type="number" min="0" max="100" step="0.01" value={draftPercentages[partner.id] ?? "0"} onChange={(event) => setDraftPercentages((current) => ({ ...current, [partner.id]: event.target.value }))} /><span>%</span></div></div>)}</div><div className={`partner-total ${totals.valid && selectedPartnerIds.length > 0 ? "valid" : "invalid"}`}>当前合计：{totals.total.toFixed(2)}% {selectedPartnerIds.length < 1 ? "（至少选择1位参与者）" : totals.valid ? "" : "（必须等于100%）"}</div><div className="partner-share-save"><div className="field"><label htmlFor="share-effective-from">生效日期</label><input id="share-effective-from" type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} /></div><div className="partner-editor-actions">{editingPlanDate ? <button className="btn" disabled={working} onClick={resetPlanEditor} type="button">取消编辑</button> : null}<button className="btn primary" disabled={working || selectedPartnerIds.length < 1 || !totals.valid} onClick={() => void saveSharePlan()} type="button"><Save size={16} />保存比例计划</button></div></div></div>
        </> : <p className="muted">暂无可配置房源。</p>}
      </SectionCard>
      {message ? <p className="partner-feedback" role="status">{message}</p> : null}
    </AppLayout>
  );
}
