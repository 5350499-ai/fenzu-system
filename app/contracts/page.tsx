"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessContract,
  BusinessProperty,
  BusinessRoom,
  BusinessTenant,
  contractKey,
  getInitialContracts,
  getInitialProperties,
  getInitialRooms,
  getInitialTenants,
  loadBusinessData,
  saveBusinessData
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
import { Ban, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const emptyContract: BusinessContract = {
  id: "",
  propertyId: "",
  roomId: "",
  tenantId: "",
  startDate: "",
  endDate: "",
  monthlyRent: 0,
  depositAmount: 0,
  status: "有效",
  notes: ""
};

const contractStatuses = ["有效", "即将到期", "已结束", "已作废"];
const maxAttachmentSize = 5 * 1024 * 1024;

export default function ContractsPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [contracts, setContracts] = useState<BusinessContract[]>([]);
  const [files, setFiles] = useState<ContractFile[]>([]);
  const [form, setForm] = useState<BusinessContract>(emptyContract);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>("business-properties", getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>("business-rooms", getInitialRooms(loadedProperties));
      const loadedTenants = await loadBusinessData<BusinessTenant>("business-tenants", getInitialTenants(loadedProperties, loadedRooms));
      const loadedContracts = await loadBusinessData<BusinessContract>(contractKey, getInitialContracts(loadedProperties, loadedRooms, loadedTenants));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setTenants(loadedTenants);
      setContracts(loadedContracts);
      setFiles(await loadContractFiles(loadedContracts.map((contract) => contract.id)));
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载合同失败：${error.message || error}`));
  }, []);

  const availableRooms = rooms.filter((room) => room.propertyId === form.propertyId);
  const availableTenants = tenants.filter((tenant) => tenant.propertyId === form.propertyId && tenant.roomId === form.roomId);
  const filesByContract = useMemo(() => {
    return files.reduce<Record<string, ContractFile[]>>((map, file) => {
      map[file.contractId] = [...(map[file.contractId] || []), file];
      return map;
    }, {});
  }, [files]);
  const filteredContracts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return contracts;
    return contracts.filter((contract) => {
      const property = properties.find((item) => item.id === contract.propertyId);
      const room = rooms.find((item) => item.id === contract.roomId);
      const tenant = tenants.find((item) => item.id === contract.tenantId);
      const fileNames = (filesByContract[contract.id] || []).map((file) => file.fileName).join(" ");
      return `${property?.name || ""} ${room?.name || ""} ${tenant?.name || ""} ${contract.status} ${fileNames}`.toLowerCase().includes(keyword);
    });
  }, [contracts, filesByContract, properties, query, rooms, tenants]);
  const visibleContracts = pageRows(filteredContracts, page, pageSize);

  function close() {
    setOpen(false);
    setForm(emptyContract);
    setPendingFile(null);
  }

  async function persist(next: BusinessContract[]) {
    setSaving(true);
    try {
      await saveBusinessData(contractKey, next);
      setContracts(next);
    } catch (error: any) {
      window.alert(error.message || "保存合同失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId || !form.roomId || !form.tenantId) return;
    setSaving(true);
    const contractId = form.id || crypto.randomUUID();
    const nextContract = { ...form, id: contractId };
    const next = form.id
      ? contracts.map((contract) => (contract.id === form.id ? nextContract : contract))
      : [nextContract, ...contracts];
    try {
      await saveBusinessData(contractKey, next);
      if (pendingFile) {
        const uploaded = await uploadContractFile(contractId, pendingFile);
        setFiles((current) => [uploaded, ...current]);
      }
      setContracts(next);
      close();
    } catch (error: any) {
      window.alert(error.message || "保存合同失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function voidContract(contract: BusinessContract) {
    if (!window.confirm("确认作废这份合同吗？作废后合同记录和附件仍会保留。")) return;
    await persist(contracts.map((item) => (item.id === contract.id ? { ...item, status: "已作废" } : item)));
  }

  async function permanentlyDelete(contract: BusinessContract) {
    if (!window.confirm("确定要永久删除这份合同吗？\n真实签署过的合同建议使用“作废”，删除后不可恢复。")) return;
    try {
      const relatedFiles = filesByContract[contract.id] || [];
      for (const file of relatedFiles) await deleteContractFile(file);
      await persist(contracts.filter((item) => item.id !== contract.id));
      setFiles((current) => current.filter((file) => file.contractId !== contract.id));
    } catch (error: any) {
      window.alert(error.message || "删除合同失败，请稍后重试。");
    }
  }

  function chooseTenant(tenantId: string) {
    const tenant = tenants.find((item) => item.id === tenantId);
    setForm((current) => ({
      ...current,
      tenantId,
      monthlyRent: tenant?.monthlyRent || current.monthlyRent,
      depositAmount: tenant?.depositAmount || current.depositAmount
    }));
  }

  function chooseFile(file?: File) {
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      window.alert("只支持 PDF、JPG、PNG 文件。");
      return;
    }
    if (file.size > maxAttachmentSize) {
      window.alert("合同附件不能超过 5MB。");
      return;
    }
    setPendingFile(file);
  }

  async function removeFile(file: ContractFile) {
    if (!window.confirm("确定要删除这个合同附件吗？\n只会删除 Storage 文件和附件记录，不会影响代码仓库。")) return;
    try {
      await deleteContractFile(file);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (error: any) {
      window.alert(error.message || "删除附件失败，请稍后重试。");
    }
  }

  return (
    <AppLayout title="合同管理" description="合同必须关联房源、房间、租客；附件存放在 Supabase Storage，不进入 GitHub。">
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">合同列表</h2>
            <p className="muted">支持 PDF/JPG/PNG，手机浏览器可拍照上传，单个文件最大 5MB。</p>
          </div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button">
            <Plus size={17} /> 新增合同
          </button>
        </div>
        <div className="list-controls">
          <label className="search-box">
            <input placeholder="搜索房源、房间、租客、合同附件" value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>房源</th>
                <th>房间</th>
                <th>租客</th>
                <th>开始日期</th>
                <th>结束日期</th>
                <th>月租</th>
                <th>押金</th>
                <th>状态</th>
                <th>附件</th>
                <th>备注</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleContracts.map((contract) => (
                <tr key={contract.id}>
                  <td>{properties.find((item) => item.id === contract.propertyId)?.name || "-"}</td>
                  <td>{rooms.find((item) => item.id === contract.roomId)?.name || "-"}</td>
                  <td>{tenants.find((item) => item.id === contract.tenantId)?.name || "-"}</td>
                  <td>{contract.startDate || "-"}</td>
                  <td>{contract.endDate || "-"}</td>
                  <td>{euro(contract.monthlyRent)}</td>
                  <td>{euro(contract.depositAmount)}</td>
                  <td><StatusBadge tone={contractTone(contract.status)}>{contract.status}</StatusBadge></td>
                  <td><AttachmentActions files={filesByContract[contract.id] || []} onDelete={removeFile} /></td>
                  <td title={contract.notes || ""}>{noteSummary(contract.notes)}</td>
                  <td><ContractActions onEdit={() => { setForm(contract); setOpen(true); }} onVoid={() => voidContract(contract)} saving={saving} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleContracts.map((contract) => {
            const tenant = tenants.find((item) => item.id === contract.tenantId);
            const room = rooms.find((item) => item.id === contract.roomId);
            const expanded = expandedNoteId === contract.id;
            return (
              <article className="mobile-record-card" key={contract.id}>
                <div className="mobile-record-title">
                  <strong>{tenant?.name || "-"}</strong>
                  <span>{contract.endDate || "-"} · <StatusBadge tone={contractTone(contract.status)}>{contract.status}</StatusBadge></span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room?.name || "-"}</strong></div>
                  <div className="mobile-record-field"><span>开始</span><strong>{contract.startDate || "-"}</strong></div>
                  <div className="mobile-record-field"><span>月租</span><strong>{euro(contract.monthlyRent)}</strong></div>
                  <div className="mobile-record-field"><span>押金</span><strong>{euro(contract.depositAmount)}</strong></div>
                  <div className="mobile-record-field"><span>附件</span><strong><AttachmentActions files={filesByContract[contract.id] || []} onDelete={removeFile} compact /></strong></div>
                  <div className="mobile-record-field">
                    <span>备注</span>
                    <strong>
                      {expanded ? contract.notes || "-" : noteSummary(contract.notes)}
                      {contract.notes && contract.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : contract.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}
                    </strong>
                  </div>
                </div>
                <ContractActions onEdit={() => { setForm(contract); setOpen(true); }} onVoid={() => voidContract(contract)} saving={saving} />
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredContracts.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2 className="panel-title">{form.id ? "编辑合同" : "新增合同"}</h2>
              <button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button>
            </div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "", tenantId: "" }))} placeholder="搜索房源名称、地址、城市" />
              <SearchableSelect label="房间" value={form.roomId} disabled={!form.propertyId} options={availableRooms.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))} onChange={(roomId) => setForm((current) => ({ ...current, roomId, tenantId: "" }))} placeholder="先选房源，再搜索房间名称、编号" />
              <SearchableSelect label="租客" value={form.tenantId} disabled={!form.roomId} options={availableTenants.map((tenant) => ({ value: tenant.id, label: tenant.name, description: `${tenant.phone} · ${tenant.wechat || "无微信"}`, keywords: `${tenant.phone} ${tenant.wechat}` }))} onChange={chooseTenant} placeholder="先选房间，再搜索租客姓名、电话、微信" />
              <div className="field"><label>开始日期</label><input required type="date" value={form.startDate} onChange={(event) => setForm((current) => ({ ...current, startDate: event.target.value }))} /></div>
              <div className="field"><label>结束日期</label><input required type="date" value={form.endDate} onChange={(event) => setForm((current) => ({ ...current, endDate: event.target.value }))} /></div>
              <MoneyInput label="月租" value={form.monthlyRent} onChange={(monthlyRent) => setForm((current) => ({ ...current, monthlyRent }))} />
              <MoneyInput label="押金" value={form.depositAmount} onChange={(depositAmount) => setForm((current) => ({ ...current, depositAmount }))} />
              <SearchableSelect label="状态" value={form.status} options={contractStatuses.map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, status }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>合同附件 PDF/JPG/PNG</label>
                <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => chooseFile(event.target.files?.[0])} />
                {pendingFile ? (
                  <div className="attachment-preview">
                    <FileUp size={16} />
                    <span>{pendingFile.name} · {formatFileSize(pendingFile.size)}</span>
                    <button className="btn danger" type="button" onClick={() => setPendingFile(null)}>移除</button>
                  </div>
                ) : <p className="muted">手机浏览器可选择拍照、相册或文件上传。图片会在上传前尽量压缩，单个附件最大 5MB。</p>}
                {form.id && (filesByContract[form.id] || []).length ? <AttachmentActions files={filesByContract[form.id] || []} onDelete={removeFile} /> : null}
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function AttachmentActions({ files, onDelete, compact }: { files: ContractFile[]; onDelete: (file: ContractFile) => void; compact?: boolean }) {
  if (!files.length) return <span className="muted">-</span>;
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <div className="attachment-preview" key={file.id} title={`${file.fileName} · ${formatFileSize(file.fileSize)}`}>
          <FileUp size={16} />
          {!compact ? <span>{file.fileName} · {formatFileSize(file.fileSize)}</span> : <span>{files.length} 个附件</span>}
          <button className="btn" type="button" onClick={() => openContractFile(file)}><Eye size={15} /> 查看</button>
          <button className="btn" type="button" onClick={() => downloadContractFile(file)}><Download size={15} /> 下载</button>
          {!compact ? <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button> : null}
        </div>
      ))}
    </div>
  );
}

function ContractActions({ onEdit, onVoid, saving }: { onEdit: () => void; onVoid: () => void; saving: boolean }) {
  return <div className="top-actions"><button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button><button className="btn" disabled={saving} onClick={onVoid} type="button"><Ban size={15} /> 作废</button></div>;
}

function contractTone(status: string) {
  if (status === "有效") return "green";
  if (status === "即将到期") return "amber";
  return "red";
}
