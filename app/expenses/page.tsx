"use client";

import { AppLayout } from "@/components/app-layout";
import { MoneyInput } from "@/components/money-input";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
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
import { noteSummary } from "@/lib/format";
import { Ban, Download, Edit3, Eye, FileUp, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const categories = ["房租", "押金", "电费", "水费", "燃气", "网络", "物业", "维修", "装修", "家具", "家电", "清洁", "其他"];
const paymentMethods = ["现金", "转账", "Bizum", "其他"];
const maxAttachmentSize = 5 * 1024 * 1024;

const emptyExpense: BusinessExpense = {
  id: "",
  propertyId: "",
  roomId: "",
  expenseMonth: new Date().toISOString().slice(0, 7),
  category: "",
  amount: 0,
  paymentDate: new Date().toISOString().slice(0, 10),
  paymentMethod: "转账",
  isPaid: true,
  notes: ""
};

export default function ExpensesPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [rooms, setRooms] = useState<BusinessRoom[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [files, setFiles] = useState<ExpenseFile[]>([]);
  const [form, setForm] = useState<BusinessExpense>(emptyExpense);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [open, setOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");

  useEffect(() => {
    async function load() {
      const loadedProperties = await loadBusinessData<BusinessProperty>(propertyKey, getInitialProperties());
      const loadedRooms = await loadBusinessData<BusinessRoom>(roomKey, getInitialRooms(loadedProperties));
      const loadedExpenses = await loadBusinessData<BusinessExpense>(expenseKey, getInitialExpenses(loadedProperties));
      setProperties(loadedProperties);
      setRooms(loadedRooms);
      setExpenses(loadedExpenses);
      try {
        setFiles(await loadExpenseFiles(loadedExpenses.map((expense) => expense.id)));
        setStorageWarning("");
      } catch {
        setFiles([]);
        setStorageWarning("支出附件功能未初始化，请先执行 expense-files SQL。普通支出记录仍可保存。");
      }
      setLoaded(true);
    }
    load().catch((error) => window.alert(`加载支出失败：${error.message || error}`));
  }, []);

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
          (!monthFilter || expense.expenseMonth.includes(monthFilter))
      ),
    [categoryFilter, expenses, monthFilter, propertyFilter]
  );
  const visibleExpenses = pageRows(filteredExpenses, page, pageSize);
  const roomOptions = rooms.filter((room) => room.propertyId === form.propertyId);

  function close() {
    setOpen(false);
    setForm(emptyExpense);
    setPendingFile(null);
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
    const nextExpense = { ...form, id: expenseId, expenseMonth: (form.paymentDate || new Date().toISOString()).slice(0, 7) };
    const next = form.id
      ? expenses.map((expense) => (expense.id === form.id ? nextExpense : expense))
      : [nextExpense, ...expenses];
    try {
      await saveBusinessData(expenseKey, next);
      if (pendingFile) {
        try {
          const uploaded = await uploadExpenseFile(expenseId, pendingFile);
          setFiles((current) => [uploaded, ...current]);
          setStorageWarning("");
        } catch (error: any) {
          setStorageWarning("支出附件功能未初始化，请先执行 expense-files SQL。普通支出记录已保存。");
          window.alert(error.message || "支出已保存，但附件上传失败。请执行 expense-files SQL 后再上传附件。");
        }
      }
      setExpenses(next);
      close();
    } catch (error: any) {
      window.alert(error.message || "保存支出失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function voidExpense(expense: BusinessExpense) {
    if (!window.confirm("确认作废这条支出记录吗？作废后金额会变为 0，但历史记录仍保留。")) return;
    await persist(expenses.map((item) => (item.id === expense.id ? { ...item, amount: 0, isPaid: true, notes: markVoided(item.notes) } : item)));
  }

  async function permanentlyDelete(expense: BusinessExpense) {
    if (!window.confirm("确定要永久删除这条支出记录吗？\n真实发生过的财务记录建议使用“作废”，删除后不可恢复。")) return;
    try {
      const relatedFiles = filesByExpense[expense.id] || [];
      for (const file of relatedFiles) await deleteExpenseFile(file);
      await persist(expenses.filter((item) => item.id !== expense.id));
      setFiles((current) => current.filter((file) => file.expenseId !== expense.id));
    } catch (error: any) {
      window.alert(error.message || "删除支出失败，请稍后重试。");
    }
  }

  function chooseFile(file?: File) {
    if (!file) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      window.alert("只支持 PDF、JPG、PNG 文件。");
      return;
    }
    if (file.size > maxAttachmentSize) {
      window.alert("支出附件不能超过 5MB。");
      return;
    }
    setPendingFile(file);
  }

  async function removeFile(file: ExpenseFile) {
    if (!window.confirm("确定要删除这个支出附件吗？")) return;
    try {
      await deleteExpenseFile(file);
      setFiles((current) => current.filter((item) => item.id !== file.id));
    } catch (error: any) {
      window.alert(error.message || "删除附件失败，请稍后重试。");
    }
  }

  return (
    <AppLayout title="支出管理" description="录入支出后会自动计入对应房源利润。真实支出建议作废，不建议直接删除。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">支出列表</h2><p className="muted">支持按房源、类别、月份筛选，并可上传票据附件。</p></div>
          <button className="btn primary" disabled={!loaded || saving} onClick={() => setOpen(true)} type="button"><Plus size={17} /> 录入支出</button>
        </div>
        {storageWarning ? <div className="notice warning">{storageWarning}</div> : null}
        <div className="list-controls">
          <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><option value="">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">全部类型</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <label className="search-box"><input placeholder="筛选月份，例如 2026-06" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>日期</th><th>房源</th><th>房间</th><th>类型</th><th>金额</th><th>付款方式</th><th>状态</th><th>附件</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visibleExpenses.map((expense) => (
              <tr key={expense.id}>
                <td>{expense.paymentDate || "-"}</td>
                <td>{properties.find((property) => property.id === expense.propertyId)?.name || "-"}</td>
                <td>{rooms.find((room) => room.id === expense.roomId)?.name || "-"}</td>
                <td>{expense.category}</td>
                <td>€{expense.amount}</td>
                <td>{expense.paymentMethod || "-"}</td>
                <td><StatusBadge tone={isVoided(expense.notes) ? "red" : expense.isPaid ? "green" : "red"}>{isVoided(expense.notes) ? "已作废" : expense.isPaid ? "已支付" : "未支付"}</StatusBadge></td>
                <td><ExpenseAttachmentActions files={filesByExpense[expense.id] || []} onDelete={removeFile} /></td>
                <td title={expense.notes || ""}>{noteSummary(cleanVoidNote(expense.notes))}</td>
                <td><ExpenseActions onDelete={() => permanentlyDelete(expense)} onEdit={() => { setForm(expense); setOpen(true); }} onVoid={() => voidExpense(expense)} saving={saving} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleExpenses.map((expense) => {
            const property = properties.find((item) => item.id === expense.propertyId);
            const room = rooms.find((item) => item.id === expense.roomId);
            const expanded = expandedNoteId === expense.id;
            return (
              <article className="mobile-record-card" key={expense.id}>
                <div className="mobile-record-title"><strong>{property?.name || "-"}</strong><span>{expense.category} · €{expense.amount}</span></div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>房间</span><strong>{room?.name || "-"}</strong></div>
                  <div className="mobile-record-field"><span>日期</span><strong>{expense.paymentDate || "-"}</strong></div>
                  <div className="mobile-record-field"><span>付款方式</span><strong>{expense.paymentMethod || "-"}</strong></div>
                  <div className="mobile-record-field"><span>状态</span><strong><StatusBadge tone={isVoided(expense.notes) ? "red" : expense.isPaid ? "green" : "red"}>{isVoided(expense.notes) ? "已作废" : expense.isPaid ? "已支付" : "未支付"}</StatusBadge></strong></div>
                  <div className="mobile-record-field"><span>附件</span><strong><ExpenseAttachmentActions files={filesByExpense[expense.id] || []} onDelete={removeFile} compact /></strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? cleanVoidNote(expense.notes) || "-" : noteSummary(cleanVoidNote(expense.notes))} {cleanVoidNote(expense.notes).length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : expense.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <ExpenseActions onDelete={() => permanentlyDelete(expense)} onEdit={() => { setForm(expense); setOpen(true); }} onVoid={() => voidExpense(expense)} saving={saving} />
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredExpenses.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑支出" : "录入支出"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId, roomId: "" }))} />
              <SearchableSelect label="房间（可选）" value={form.roomId || ""} disabled={!form.propertyId} options={[{ value: "", label: "不关联房间" }, ...roomOptions.map((room) => ({ value: room.id, label: room.name, description: `编号 ${room.roomNumber} · ${room.status}`, keywords: room.roomNumber }))]} onChange={(roomId) => setForm((current) => ({ ...current, roomId }))} />
              <div className="field"><label>支出日期</label><input required type="date" value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value, expenseMonth: event.target.value.slice(0, 7) }))} /></div>
              <CategoryInput value={form.category} onChange={(category) => setForm((current) => ({ ...current, category }))} />
              <MoneyInput label="金额" value={form.amount} onChange={(amount) => setForm((current) => ({ ...current, amount }))} />
              <SearchableSelect label="付款方式" value={form.paymentMethod || "转账"} options={paymentMethods.map((method) => ({ value: method, label: method }))} onChange={(paymentMethod) => setForm((current) => ({ ...current, paymentMethod }))} />
              <SearchableSelect label="支付状态" value={form.isPaid ? "已支付" : "未支付"} options={["已支付", "未支付"].map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, isPaid: status === "已支付" }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>附件 PDF/JPG/PNG</label>
                <input accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" type="file" onChange={(event) => chooseFile(event.target.files?.[0])} />
                {pendingFile ? <div className="attachment-preview"><FileUp size={16} /><span>{pendingFile.name} · {formatFileSize(pendingFile.size)}</span><button className="btn danger" type="button" onClick={() => setPendingFile(null)}>移除</button></div> : <p className="muted">可上传票据、截图或照片，单个附件最大 5MB。</p>}
                {form.id && (filesByExpense[form.id] || []).length ? <ExpenseAttachmentActions files={filesByExpense[form.id] || []} onDelete={removeFile} /> : null}
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={cleanVoidNote(form.notes)} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" disabled={saving} type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}

function ExpenseAttachmentActions({ files, onDelete, compact }: { files: ExpenseFile[]; onDelete: (file: ExpenseFile) => void; compact?: boolean }) {
  if (!files.length) return <span className="muted">-</span>;
  return <div className="attachment-list">{files.map((file) => <div className="attachment-preview" key={file.id}><FileUp size={16} />{!compact ? <span>{file.fileName} · {formatFileSize(file.fileSize)}</span> : <span>{files.length} 个附件</span>}<button className="btn" type="button" onClick={() => openExpenseFile(file)}><Eye size={15} /> 查看</button><button className="btn" type="button" onClick={() => downloadExpenseFile(file)}><Download size={15} /> 下载</button>{!compact ? <button className="btn danger" type="button" onClick={() => onDelete(file)}><Trash2 size={15} /> 删除</button> : null}</div>)}</div>;
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

function ExpenseActions({ onEdit, onVoid, onDelete, saving }: { onEdit: () => void; onVoid: () => void; onDelete: () => void; saving: boolean }) {
  return <div className="top-actions"><button className="btn" onClick={onEdit} type="button"><Edit3 size={15} /> 编辑</button><button className="btn" disabled={saving} onClick={onVoid} type="button"><Ban size={15} /> 作废</button><button className="btn danger" disabled={saving} onClick={onDelete} type="button"><Trash2 size={15} /> 永久删除</button></div>;
}

function markVoided(notes?: string) {
  const clean = cleanVoidNote(notes);
  return clean ? `[已作废] ${clean}` : "[已作废]";
}

function isVoided(notes?: string) {
  return Boolean(notes?.includes("[已作废]"));
}

function cleanVoidNote(notes?: string) {
  return (notes || "").replace("[已作废]", "").trim();
}
