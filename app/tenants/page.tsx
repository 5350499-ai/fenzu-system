"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessDeposit,
  BusinessProperty,
  BusinessRentPayment,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  depositKey,
  getInitialContracts,
  getInitialDeposits,
  getInitialProperties,
  getInitialRentPayments,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  rentPaymentKey,
  roomKey,
  saveBusinessData,
  tenantKey
} from "@/lib/business-data";
import {
  ContractFile,
  deleteContractFile,
  downloadContractFile,
  formatFileSize,
  loadContractFiles,
  openContractFile,
  uploadContractFile
} from "@/lib/contract-files";
import { euro, noteSummary } from "@/lib/format";
import { Archive, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";

const sources = ["微信群", "华人街", "小红书", "Facebook", "朋友介绍", "其他"];
const tenantStatuses = ["在租", "预定入住", "已退租"];
const maxAttachmentSize = 5 * 1024 * 1024;

const emptyTenant: BusinessTenant = {
  id: "",
  propertyId: "",
  roomId: "",
  name: "",
  phone: "",
  wechat: "",
  source: "其他",
  monthlyRent: 0,
  depositAmount: 0,
  status: "在租",
  notes: ""
};

export default function TenantsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [payments, setPayments] = useState<BusinessRentPayment[]>([]);
  const [deposits, setDeposits] = useState<BusinessDeposit[]>([]);
  const [contractFiles, setContractFiles] = useState<ContractFile[]>([]);
  const [form, setForm] = useState<BusinessTenant>(emptyTenant);
  const [pendingContractFile, setPendingContractFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailTenantId, setDetailTenantId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>(tenantKey, getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts());
      const loadedPayments = await loadBusinessData<BusinessRentPayment>(rentPaymentKey, getInitialRentPayments());
      const loadedDeposits = await loadBusinessData<BusinessDeposit>(depositKey, getInitialDeposits());
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setPayments(loadedPayments);
      setDeposits(loadedDeposits);
      setContractFiles(await loadContractFiles(loadedContracts.map((contract) => contract.id)));
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载租客失败：${error.message || error}`));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const filesByContract = useMemo(() => contractFiles.reduce<Record<string, ContractFile[]>>((map, file) => {
    map[file.contractId] = [...(map[file.contractId] || []), file];
    return map;
  }, {}), [contractFiles]);
  const latestTenantContract = useMemo(() => latestContractForTenant(form.id, contracts), [contracts, form.id]);
  const currentTenantFiles = useMemo(() => getTenantFiles(form.id, contracts, filesByContract), [contracts, filesByContract, form.id]);

  const filteredTenants = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return tenants;
    return tenants.filter((tenant) => {
      const property = properties.find((item) => item.id === tenant.propertyId);
      const room = rooms.find((item) => item.id === tenant.roomId);
      const fileNames = getTenantFiles(tenant.id, contracts, filesByContract).map((file) => file.fileName).join(" ");
      return `${tenant.name} ${tenant.phone} ${tenant.wechat} ${property?.name || ""} ${room?.name || ""} ${tenant.status} ${fileNames}`.toLowerCase().includes(keyword);
    });
  }, [contracts, filesByContract, properties, query, rooms, tenants]);
  const visibleTenants = pageRows(filteredTenants, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyTenant);
    setPendingContractFile(null);
  }

  async function persistAll(next: {
    tenants?: BusinessTenant[];
    rooms?: BusinessRoom[];
    contracts?: BusinessContract[];
    deposits?: BusinessDeposit[];
  }) {
    setSaving(true);
    try {
      if (next.tenants) await saveBusinessData(tenantKey, next.tenants);
      if (next.rooms) await saveBusinessData(roomKey, next.rooms);
      if (next.contracts) await saveBusinessData(contractKey, next.contracts);
      if (next.deposits) await saveBusinessData(depositKey, next.deposits);
      if (next.tenants) setTenants(next.tenants);
      if (next.rooms) setRooms(next.rooms);
      if (next.contracts) setContracts(next.contracts);
      if (next.deposits) setDeposits(next.deposits);
    } catch (error: any) {
      window.alert(error.message || "保存失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.roomId || !form.name.trim()) return;
    const next = form.id
      ? tenants.map((tenant) => (tenant.id === form.id ? form : tenant))
      : [{ ...form, id: crypto.randomUUID() }, ...tenants];
    await persistAll({ tenants: next });

    if (form.id && pendingContractFile) {
      if (!latestTenantContract) {
        window.alert("该租客还没有合同记录，请先通过一键入住或合同数据创建合同后再上传合同附件。");
      } else {
        const existing = filesByContract[latestTenantContract.id] || [];
        for (const file of existing) await deleteContractFile(file);
        const uploaded = await uploadContractFile(latestTenantContract.id, pendingContractFile);
        setContractFiles((current) => [uploaded, ...current.filter((file) => file.contractId !== latestTenantContract.id)]);
      }
    }

    close();
  }

  async function moveOut(tenant: BusinessTenant) {
    if (!window.confirm("确认办理退租/归档吗？\n将保留历史收租记录，并把房间设为空置、合同设为已结束。")) return;
    const depositStatus = window.prompt("押金状态请输入：已退 或 待退", "待退") === "已退" ? "已退" : "待退";
    await persistAll({
      tenants: tenants.map((item) => (item.id === tenant.id ? { ...item, status: "已退租" } : item)),
      rooms: rooms.map((room) => (room.id === tenant.roomId ? { ...room, status: "空置" } : room)),
      contracts: contracts.map((contract) => (contract.tenantId === tenant.id ? { ...contract, status: "已结束" } : contract)),
      deposits: deposits.map((deposit) => (deposit.tenantId === tenant.id ? { ...deposit, status: depositStatus } : deposit))
    });
  }

  function chooseContractFile(file?: File) {
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      window.alert("只支持 PDF、JPG、PNG 文件。");
      return;
    }
    if (file.size > maxAttachmentSize) {
      window.alert("合同附件不能超过 5MB。");
      return;
    }
    setPendingContractFile(file);
  }

  async function removeContractFile(file: ContractFile) {
    if (!window.confirm("确定要删除这个合同附件吗？")) return;
    await deleteContractFile(file);
    setContractFiles((current) => current.filter((item) => item.id !== file.id));
  }

  return (
    <AppLayout title="租客管理" description="合同附件已整合进租客管理：展开租客即可查看、下载、替换、删除合同。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">租客列表</h2><p className="muted">点击租客行可展开合同附件和完整信息。</p></div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增租客</button>
        </div>
        <div className="list-controls"><label className="search-box"><input placeholder="搜索姓名、电话、微信、房源、房间、合同附件" value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>姓名</th><th>电话</th><th>微信</th><th>房源</th><th>房间</th><th>月租</th><th>状态</th><th>合同附件</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visibleTenants.map((tenant) => {
              const tenantFiles = getTenantFiles(tenant.id, contracts, filesByContract);
              const expanded = detailTenantId === tenant.id;
              return (
                <Fragment key={tenant.id}>
                  <tr className="compact-row" onClick={() => setDetailTenantId(expanded ? "" : tenant.id)}>
                    <td>{tenant.name}</td>
                    <td>{tenant.phone || "-"}</td>
                    <td>{tenant.wechat || "-"}</td>
                    <td>{properties.find((item) => item.id === tenant.propertyId)?.name || "-"}</td>
                    <td>{rooms.find((item) => item.id === tenant.roomId)?.name || "-"}</td>
                    <td>{euro(tenant.monthlyRent)}</td>
                    <td><StatusBadge tone={tenant.status.includes("退") ? "red" : tenant.status.includes("预") ? "amber" : "green"}>{tenant.status}</StatusBadge></td>
                    <td><TenantAttachmentActions files={tenantFiles} onDelete={removeContractFile} compact /></td>
                    <td title={tenant.notes || ""}>{noteSummary(tenant.notes)}</td>
                    <td><TenantActions onEdit={() => { setForm(tenant); setOpen(true); }} onMoveOut={() => moveOut(tenant)} saving={saving} /></td>
                  </tr>
                  {expanded ? (
                    <tr className="detail-row">
                      <td colSpan={10}>
                        <TenantDetail tenant={tenant} files={tenantFiles} onDeleteFile={removeContractFile} onEdit={() => { setForm(tenant); setOpen(true); }} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleTenants.map((tenant) => {
            const property = properties.find((item) => item.id === tenant.propertyId);
            const room = rooms.find((item) => item.id === tenant.roomId);
            const expanded = detailTenantId === tenant.id;
            const tenantFiles = getTenantFiles(tenant.id, contracts, filesByContract);
            return (
              <article className="mobile-record-card compact-record-card" key={tenant.id}>
                <button className="compact-record-button" onClick={() => setDetailTenantId(expanded ? "" : tenant.id)} type="button">
                  <strong>{tenant.name}</strong>
                  <span>{euro(tenant.monthlyRent)}</span>
                  <small>{property?.name || "-"} / {room?.name || "-"} · 合同 {tenantFiles.length} 个</small>
                </button>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>电话</span><strong>{tenant.phone || "-"}</strong></div>
                  <div className="mobile-record-field"><span>微信</span><strong>{tenant.wechat || "-"}</strong></div>
                  <div className="mobile-record-field"><span>状态</span><strong><StatusBadge tone={tenant.status.includes("退") ? "red" : tenant.status.includes("预") ? "amber" : "green"}>{tenant.status}</StatusBadge></strong></div>
                </div>
                <TenantActions onEdit={() => { setForm(tenant); setOpen(true); }} onMoveOut={() => moveOut(tenant)} saving={saving} />
                {expanded ? <TenantDetail tenant={tenant} files={tenantFiles} onDeleteFile={removeContractFile} onEdit={() => { setForm(tenant); setOpen(true); }} /> : null}
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredTenants.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑租客" : "新增租客"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "" }))} placeholder="搜索房源名称、地址、城市" />
              <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId }))} placeholder="先选房源，再搜索房间名称、编号" />
              <TextField label="姓名" required value={form.name} onChange={(name) => setForm((current) => ({ ...current, name }))} />
              <TextField label="电话" value={form.phone} onChange={(phone) => setForm((current) => ({ ...current, phone }))} />
              <TextField label="微信" value={form.wechat} onChange={(wechat) => setForm((current) => ({ ...current, wechat }))} />
              <SearchableSelect label="来源" value={form.source} options={sources.map((source) => ({ value: source, label: source }))} onChange={(source) => setForm((current) => ({ ...current, source }))} />
              <MoneyInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((current) => ({ ...current, monthlyRent }))} />
              <MoneyInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
              <SearchableSelect label="状态" value={form.status} options={tenantStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              {form.id ? (
                <div className="field" style={{ gridColumn: "1 / -1" }}>
                  <label>合同附件</label>
                  <TenantAttachmentActions files={currentTenantFiles} onDelete={removeContractFile} />
                  <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => chooseContractFile(event.target.files?.[0])} />
                  {pendingContractFile ? <div className="attachment-preview"><FileUp size={16} /><span>{pendingContractFile.name} · {formatFileSize(pendingContractFile.size)}</span><button className="btn danger" type="button" onClick={() => setPendingContractFile(null)}>移除</button></div> : <p className="muted">选择新文件并保存后，会替换该租客最新合同的附件。</p>}
                </div>
              ) : null}
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function TenantDetail({ tenant, files, onDeleteFile, onEdit }: { tenant: BusinessTenant; files: ContractFile[]; onDeleteFile: (file: ContractFile) => void; onEdit: () => void }) {
  return (
    <div className="record-detail-panel">
      <div className="detail-grid">
        <DetailField label="合同附件" value={`${files.length} 个`} />
        <DetailField label="备注" value={tenant.notes || "-"} />
      </div>
      <div>
        <div className="detail-section-title">合同附件</div>
        <TenantAttachmentActions files={files} onDelete={onDeleteFile} />
      </div>
      <div className="top-actions detail-actions">
        <button className="btn" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑/替换合同</button>
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="detail-field"><span>{label}</span><strong>{value}</strong></div>;
}

function TenantAttachmentActions({ files, onDelete, compact }: { files: ContractFile[]; onDelete: (file: ContractFile) => void; compact?: boolean }) {
  if (!files.length) return <span className="muted">暂无附件</span>;
  if (compact) return <span>{files.length} 个附件</span>;
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <div className="attachment-preview" key={file.id}>
          <FileUp size={16} />
          <span>{file.fileName} · {formatFileSize(file.fileSize)}</span>
          <button className="btn" type="button" onClick={() => openContractFile(file)}><Eye size={15} /> 查看</button>
          <button className="btn" type="button" onClick={() => downloadContractFile(file)}><Download size={15} /> 下载</button>
          <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button>
        </div>
      ))}
    </div>
  );
}

function TenantActions({ onEdit, onMoveOut, saving }: { onEdit: () => void; onMoveOut: () => void; saving: boolean }) {
  return (
    <div className="top-actions">
      <button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button>
      <button className="btn" disabled={saving} onClick={onMoveOut} type="button"><Archive size={15} /> 退租/归档</button>
    </div>
  );
}

function latestContractForTenant(tenantId: string, contracts: BusinessContract[]) {
  if (!tenantId) return null;
  return contracts
    .filter((contract) => contract.tenantId === tenantId)
    .sort((a, b) => (b.startDate || "").localeCompare(a.startDate || ""))[0] || null;
}

function getTenantFiles(tenantId: string, contracts: BusinessContract[], filesByContract: Record<string, ContractFile[]>) {
  if (!tenantId) return [];
  return contracts
    .filter((contract) => contract.tenantId === tenantId)
    .flatMap((contract) => filesByContract[contract.id] || []);
}

function TextField({ label, value, onChange, required }: { label: string; value?: string; onChange: (value: string) => void; required?: boolean }) {
  return <div className="field"><label>{label}</label><input required={required} value={value || ""} onChange={(event) => onChange(event.target.value)} /></div>;
}
