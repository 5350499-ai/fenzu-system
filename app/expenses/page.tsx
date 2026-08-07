"use client";

import { AppLayout } from "@/components/app-layout";
import { useAccountAccess } from "@/components/account-access";
import { AttachmentAddControl } from "@/components/attachment-add-control";
import { AttachmentLoadState, AttachmentLoadStateNotice } from "@/components/attachment-load-state";
import { DateFilterPreset, DateRangeFilter, dateRangeForMonth, dateRangeForPreset, isDateInRange } from "@/components/date-range-filter";
import { MoneyInput } from "@/components/money-input";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import { CompactDetailGrid, CompactDetailGroup, CompactDetailRow } from "@/components/ui";
import {
  BusinessExpense,
  BusinessProperty,
  BusinessRoom,
  expenseKey,
  getInitialExpenses,
  getInitialProperties,
  getInitialRooms,
  loadBusinessData,
  propertyKey,
  roomKey,
  saveBusinessData
} from "@/lib/business-data";
import {
  deleteExpenseFile,
  downloadExpenseFile,
  ExpenseFile,
  formatFileSize,
  loadExpenseFiles,
  openExpenseFile,
  uploadExpenseFile
} from "@/lib/expense-files";
import { euro } from "@/lib/format";
import { buildActivePartnerOptions, buildPartnerDirectory, getPartners, preserveStoredPartnerOption } from "@/lib/partners";
import { partnerClass, partnerLabel } from "@/lib/partner-settings";
import { Ban, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const categories = ["房租", "押金", "电费", "水费", "燃气", "网络", "物业", "维修", "装修", "家具", "家电", "清洁", "其他"];
const paymentMethods = ["现金", "转账", "Bizum", "其他"];
const emptyExpense: BusinessExpense = {
  id: "",
  propertyId: "",
  roomId: "",
  expenseMonth: new Date().toISOString().slice(0, 7),
  category: "",
  amount: 0,
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "转账",
  paidBy: "",
  isPaid: true,
  notes: ""
};

export default function ExpensesPage() {
  const access = useAccountAccess();
  const [partnerDirectory, setPartnerDirectory] = useState<Record<string, string>>({});
  const [partnerOptions, setPartnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [files, setFiles] = useState<ExpenseFile[]>([]);
  const [filesLoadState, setFilesLoadState] = useState<AttachmentLoadState>("loading");
  const [filesLoadError, setFilesLoadError] = useState("");
  const [form, setForm] = useState<BusinessExpense>(emptyExpense);
  const [open, setOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [datePreset, setDatePreset] = useState<DateFilterPreset>("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [detailExpenseId, setDetailExpenseId] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const filesRequestRef = useRef(0);

  const refreshExpenseFiles = useCallback(async (expenseIds: string[]) => {
    const ids = [...new Set(expenseIds.filter(Boolean))];
    const requestId = ++filesRequestRef.current;
    setFilesLoadState("loading");
    setFilesLoadError("");
    if (!ids.length) {
      setFilesLoadState("success");
      return;
    }
    try {
      const refreshedFiles = await loadExpenseFiles(ids);
      if (requestId !== filesRequestRef.current) return;
      setFiles((current) => [...refreshedFiles, ...current.filter((file) => !ids.includes(file.expenseId))]);
      setFilesLoadState("success");
    } catch (error: any) {
      if (requestId !== filesRequestRef.current) return;
      setFilesLoadState("error");
      setFilesLoadError(error?.message || "附件加载失败。");
    }
  }, []);

  useEffect(() => {
    const month = new URLSearchParams(window.location.search).get("month");
    const range = month ? dateRangeForMonth(month) : null;
    if (range) {
      setDatePreset("custom");
      setDateStart(range.startDate);
      setDateEnd(range.endDate);
    }
  }, []);

  useEffect(() => {
    async function load() {
      const partnerData = await getPartners();
      const nextDirectory = buildPartnerDirectory(partnerData);
      const nextOptions = buildActivePartnerOptions(partnerData);
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setExpenses(loadedExpenses);
      setPartnerDirectory(nextDirectory);
      setPartnerOptions(nextOptions);
      await refreshExpenseFiles(loadedExpenses.map((expense) => expense.id));
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载支出失败：${error.message || error}`));
  }, []);

  useEffect(() => {
    if (!loaded || !detailExpenseId) return;
    void refreshExpenseFiles([detailExpenseId]);
  }, [detailExpenseId, loaded, refreshExpenseFiles]);

  const filesByExpense = useMemo(() => files.reduce<Record<string, ExpenseFile[]>>((map, file) => {
    map[file.expenseId] = [...(map[file.expenseId] || []), file];
    return map;
  }, {}), [files]);

  const filteredExpenses = useMemo(
    () =>
      expenses.filter(
        (expense) =>
          (!propertyFilter || expense.propertyId === propertyFilter) &&
          (!categoryFilter || expense.category === categoryFilter) &&
          isDateInRange(expense.paymentDate, { startDate: dateStart, endDate: dateEnd })
      ),
    [categoryFilter, dateEnd, dateStart, expenses, propertyFilter]
  );
  const filteredExpenseTotal = useMemo(
    () => filteredExpenses.reduce((total, expense) => total + Number(expense.amount || 0), 0),
    [filteredExpenses]
  );
  const visibleExpenses = pageRows(filteredExpenses, page, pageSize);
  const roomOptions = rooms.filter((room) => room.propertyId === form.propertyId);
  const expensePartnerOptions = useMemo(
    () => preserveStoredPartnerOption(partnerOptions, form.paidBy, partnerDirectory),
    [form.paidBy, partnerDirectory, partnerOptions]
  );

  function close() {
    setOpen(false);
    setForm(emptyExpense);
    setPendingFiles([]);
  }

  function updateDatePreset(preset: DateFilterPreset) {
    setDatePreset(preset);
    if (preset === "custom") {
      setDateStart("");
      setDateEnd("");
    } else {
      const range = dateRangeForPreset(preset);
      setDateStart(range.startDate);
      setDateEnd(range.endDate);
    }
    setPage(1);
  }

  function updateDateStart(value: string) {
    setDateStart(value);
    if (dateEnd && value && dateEnd < value) setDateEnd(value);
    setPage(1);
  }

  function updateDateEnd(value: string) {
    setDateEnd(value && dateStart && value < dateStart ? dateStart : value);
    setPage(1);
  }

  async function persist(next: BusinessExpense[]) {
    setSaving(true);
    try {
      await saveBusinessData(expenseKey, next);
      setExpenses(next);
    } catch (error: any) {
      window.alert(error.message || "保存支出失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || !form.propertyId) return;
    setSaving(true);
    const expenseId = form.id || crypto.randomUUID();
    const nextExpense = {
      ...form,
      id: expenseId,
      amount: Number(form.amount || 0),
      paidBy: form.paidBy,
      expenseMonth: (form.paymentDate || new Date().toISOString()).slice(0, 7)
    };
    const next = form.id
      ? expenses.map((expense) => (expense.id === form.id ? nextExpense : expense))
      : [nextExpense, ...expenses];
    try {
      await saveBusinessData(expenseKey, next);
      setExpenses(next);
      if (!form.id && pendingFiles.length) {
        const uploadedFiles: ExpenseFile[] = [];
        try {
          for (const file of pendingFiles) uploadedFiles.push(await uploadExpenseFile(expenseId, file));
          setFiles((current) => [...uploadedFiles, ...current]);
        } catch (error: any) {
          if (uploadedFiles.length) setFiles((current) => [...uploadedFiles, ...current]);
          window.alert(`支出已保存，但附件上传失败：${error.message || error}`);
        }
      }
      close();
    } catch (error: any) {
      window.alert(error.message || "保存支出失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function voidExpense(expense: BusinessExpense) {
    if (!window.confirm("确认作废这条支出记录吗？作废后原始金额和历史信息仍会保留。")) return;
    await persist(expenses.map((item) => (item.id === expense.id ? { ...item, notes: markVoided(item.notes) } : item)));
  }

  async function permanentlyDelete(expense: BusinessExpense) {
    if (!window.confirm("确定要永久删除这条支出记录吗？\n真实发生过的财务记录建议使用“作废”，删除后不可恢复。")) return;
    const relatedFiles = filesByExpense[expense.id] || [];
    for (const file of relatedFiles) await deleteExpenseFile(file);
    await persist(expenses.filter((item) => item.id !== expense.id));
    setFiles((current) => current.filter((file) => file.expenseId !== expense.id));
    setDetailExpenseId("");
  }

  async function addExpenseFile(expense: BusinessExpense, file: File) {
    setSaving(true);
    try {
      const uploaded = await uploadExpenseFile(expense.id, file);
      setFiles((current) => [uploaded, ...current]);
      await refreshExpenseFiles([expense.id]);
    } catch (error: any) {
      throw new Error(error.message || "添加支出附件失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function removeFile(file: ExpenseFile) {
    if (!window.confirm("确定要删除这个支出附件吗？")) return;
    await deleteExpenseFile(file);
    setFiles((current) => current.filter((item) => item.id !== file.id));
  }

  return (
    <AppLayout title="支出管理" description="默认压缩显示支出明细，点击一条记录后查看附件和完整信息。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">支出列表</h2><p className="muted">日期｜归属｜项目｜金额｜状态</p></div>
          {access.can("expenses", "create") ? <button className="btn primary" disabled={!loaded || saving || !partnerOptions.length} onClick={() => { setForm({ ...emptyExpense, paidBy: partnerOptions[0]?.value || "" }); setPendingFiles([]); setOpen(true); }} type="button"><Plus size={17} /> 录入支出</button> : null}
        </div>
        {storageWarning ? <div className="notice warning">{storageWarning}</div> : null}
        <div className="list-controls">
          <select value={propertyFilter} onChange={(event) => { setPropertyFilter(event.target.value); setPage(1); }}><option value="">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPage(1); }}><option value="">全部类型</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <DateRangeFilter preset={datePreset} startDate={dateStart} endDate={dateEnd} onPresetChange={updateDatePreset} onStartDateChange={updateDateStart} onEndDateChange={updateDateEnd} />
        </div>
        <div className="filtered-total" aria-live="polite"><span>当前筛选支出合计</span><strong>{euro(filteredExpenseTotal)}</strong></div>

        <div className="finance-list">
          {visibleExpenses.map((expense) => {
            const property = properties.find((item) => item.id === expense.propertyId);
            const room = rooms.find((item) => item.id === expense.roomId);
            const expanded = detailExpenseId === expense.id;
            return (
              <article className="finance-list-item" key={expense.id}>
                <button className="finance-line expense-finance-line" onClick={() => setDetailExpenseId(expanded ? "" : expense.id)} type="button">
                  <span>{expense.paymentDate || "-"}</span>
                  <span className={`partner-tag ${partnerClass(expense.paidBy)}`}>{partnerLabel(expense.paidBy, partnerDirectory)}</span>
                  <span>{expense.category || "-"}</span>
                  <strong>{euro(expense.amount)}</strong>
                  <StatusBadge tone={isVoided(expense.notes) ? "red" : "green"}>{isVoided(expense.notes) ? "已作废" : "已支出"}</StatusBadge>
                </button>
                {expanded ? (
                  <ExpenseDetail
                    expense={expense}
                    partnerDirectory={partnerDirectory}
                    propertyName={property?.name || "-"}
                    roomName={room?.name || "-"}
                    files={filesByExpense[expense.id] || []}
                    attachmentLoadState={filesLoadState}
                    attachmentLoadError={filesLoadError}
                    onRetryFiles={() => void refreshExpenseFiles([expense.id])}
                    onEdit={() => { setForm(expense); setPendingFiles([]); setOpen(true); }}
                    onVoid={() => voidExpense(expense)}
                    onDelete={() => permanentlyDelete(expense)}
                    onAddFile={(file) => addExpenseFile(expense, file)}
                    onFileDelete={removeFile}
                    saving={saving}
                    canEdit={access.can("expenses", "edit")}
                    canArchive={access.can("expenses", "archive")}
                    canDelete={access.can("expenses", "delete")}
                    canViewFiles={access.can("attachments") && access.canSensitive("canViewExpenseFiles")}
                    canUploadFiles={access.can("attachments", "create") && access.canSensitive("canUploadFiles")}
                    canDownloadFiles={access.canSensitive("canDownloadFiles")}
                    canDeleteFiles={access.can("attachments", "delete") && access.canSensitive("canDeleteFiles")}
                  />
                ) : null}
              </article>
            );
          })}
          {!visibleExpenses.length ? <p className="muted">暂无支出记录。</p> : null}
        </div>

        <PaginationControls page={page} pageSize={pageSize} total={filteredExpenses.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑支出" : "录入支出"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid expense-form-grid" onSubmit={submit}>
              <SearchableSelect className="expense-form-wide" label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "" }))} />
              <SearchableSelect className="expense-form-wide" label="房间（可选）" value={form.roomId || ""} disabled={!form.propertyId} options={[{ value: "", label: "不关联房间" }, ...roomOptions.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))]} onChange={(roomId) => setForm((current) => ({ ...current, roomId }))} />
              <div className="field"><label>支出日期</label><input required type="date" value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value, expenseMonth: event.target.value.slice(0, 7) }))} /></div>
              <CategoryInput value={form.category} onChange={(category) => setForm((current) => ({ ...current, category }))} />
              <MoneyInput label="金额" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
              <SearchableSelect label="付款方式" value={form.paymentMethod || "转账"} options={paymentMethods.map((method) => ({ value: method, label: method }))} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} />
              <SearchableSelect label="付款归属" value={form.paidBy || ""} disabled={!expensePartnerOptions.length} placeholder={expensePartnerOptions.length ? undefined : "暂无可用合伙人"} options={expensePartnerOptions} onChange={(paidBy) => setForm((current) => ({ ...current, paidBy }))} />
              <SearchableSelect label="账目状态" value={isVoided(form.notes) ? "已作废" : "已支出"} options={["已支出", "已作废"].map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, notes: status === "已作废" ? markVoided(current.notes) : cleanVoidNote(current.notes) }))} />
              <p className="muted" style={{ gridColumn: "1 / -1" }}>支出保存后，可在支出详情中逐个添加附件；添加附件不会覆盖已有文件。</p>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={cleanVoidNote(form.notes)} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              {!form.id ? <div className="expense-new-attachments field" style={{ gridColumn: "1 / -1" }}>
                <label>附件（可选）</label>
                <input type="file" multiple onChange={(event) => setPendingFiles(Array.from(event.target.files || []))} />
                <span className="muted">{pendingFiles.length ? `已选择 ${pendingFiles.length} 个文件，保存支出后自动上传。` : "可先选择文件，保存支出时一起上传。"}</span>
              </div> : null}
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">{!form.id && pendingFiles.length ? "保存并上传附件" : "保存"}</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function ExpenseDetail({
  expense,
  partnerDirectory,
  propertyName,
  roomName,
  files,
  attachmentLoadState,
  attachmentLoadError,
  onRetryFiles,
  onEdit,
  onVoid,
  onDelete,
  onAddFile,
  onFileDelete,
  saving,
  canEdit,
  canArchive,
  canDelete,
  canViewFiles,
  canUploadFiles,
  canDownloadFiles,
  canDeleteFiles
}: {
  expense: BusinessExpense;
  partnerDirectory: Record<string, string>;
  propertyName: string;
  roomName: string;
  files: ExpenseFile[];
  attachmentLoadState: AttachmentLoadState;
  attachmentLoadError: string;
  onRetryFiles: () => void;
  onEdit: () => void;
  onVoid: () => void;
  onDelete: () => void;
  onAddFile: (file: File) => Promise<void>;
  onFileDelete: (file: ExpenseFile) => void;
  saving: boolean;
  canEdit: boolean;
  canArchive: boolean;
  canDelete: boolean;
  canViewFiles: boolean;
  canUploadFiles: boolean;
  canDownloadFiles: boolean;
  canDeleteFiles: boolean;
}) {
  const [attachmentsOpen, setAttachmentsOpen] = useState(false);
  return (
    <div className="record-detail-panel">
      <CompactDetailGroup className="record-core-detail-group">
        <CompactDetailGrid className="expense-core-detail-grid">
        <DetailField label="房源" value={propertyName} />
        <DetailField label="房间" value={roomName} />
        <DetailField label="付款方式" value={expense.paymentMethod || "-"} />
        <DetailField label="付款归属" value={partnerLabel(expense.paidBy, partnerDirectory)} />
        <DetailField label="备注" value={cleanVoidNote(expense.notes) || "-"} />
        </CompactDetailGrid>
      </CompactDetailGroup>
      {canViewFiles ? <div className={`attachment-panel expense-attachment-panel${attachmentsOpen ? " attachments-open" : ""}`}>
        <button className="attachment-toggle" type="button" onClick={() => setAttachmentsOpen((current) => !current)} aria-expanded={attachmentsOpen}>
          附件（{files.length}个） <span>{attachmentsOpen ? "收起 ▲" : "展开 ▼"}</span>
        </button>
        {attachmentsOpen ? <>
          <ExpenseAttachmentActions files={files} loadState={attachmentLoadState} loadError={attachmentLoadError} onRetry={onRetryFiles} onDelete={onFileDelete} canDownload={canDownloadFiles} canDelete={canDeleteFiles} />
          {canUploadFiles ? <AttachmentAddControl label="支出附件" disabled={saving} onAdd={onAddFile} /> : null}
        </> : null}
      </div> : null}
      <div className="expense-detail-actions">
        {canEdit ? <button className="btn expense-detail-action" type="button" onClick={onEdit}><Edit3 size={15} /> 编辑支出</button> : <span aria-hidden="true" />}
        {canArchive ? <button className="btn expense-detail-action" disabled={saving} type="button" onClick={onVoid}><Ban size={15} /> 作废</button> : <span aria-hidden="true" />}
        {canDelete ? <button className="btn danger expense-detail-action" type="button" onClick={onDelete}><Trash2 size={15} /> 永久删除</button> : <span aria-hidden="true" />}
      </div>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <CompactDetailRow label={label} value={value} />;
}

function ExpenseAttachmentActions({ files, loadState, loadError, onRetry, onDelete, canDownload = true, canDelete = true }: { files: ExpenseFile[]; loadState: AttachmentLoadState; loadError: string; onRetry: () => void; onDelete: (file: ExpenseFile) => void; canDownload?: boolean; canDelete?: boolean }) {
  if (loadState !== "success" || !files.length) {
    return <AttachmentLoadStateNotice state={loadState} error={loadError} onRetry={onRetry} emptyLabel="暂无附件" hasFiles={files.length > 0} />;
  }
  return (
    <div className="attachment-list">
      {files.map((file) => (
        <div className="attachment-preview attachment-file-card" key={file.id}>
          <FileUp size={16} />
          <span>{file.fileName} · {formatFileSize(file.fileSize)}</span>
          <button className="btn" type="button" onClick={() => openExpenseFile(file)}><Eye size={15} /> 查看</button>
          {canDownload ? <button className="btn" type="button" onClick={() => downloadExpenseFile(file)}><Download size={15} /> 下载</button> : null}
          {canDelete ? <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button> : null}
        </div>
      ))}
    </div>
  );
}

function CategoryInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="field">
      <label>支出类型</label>
      <input
        list="expense-category-options"
        placeholder="可选预设，也可输入自定义类型"
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <datalist id="expense-category-options">
        {categories.map((category) => <option key={category} value={category} />)}
      </datalist>
    </div>
  );
}

function markVoided(notes?: string) {
  const clean = cleanVoidNote(notes);
  return clean ? `[已作废] ${clean}` : "[已作废]";
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]") || notes?.includes("[宸蹭綔搴焆"));
}

function cleanVoidNote(notes?: string) {
  return (notes || "").replace("[已作废]", "").replace("[宸蹭綔搴焆", "").trim();
}
