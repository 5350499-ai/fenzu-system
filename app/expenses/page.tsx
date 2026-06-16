"use client";

import { AppLayout } from "@/components/app-layout";
import { pageRows, PaginationControls } from "@/components/pagination-controls";
import { SearchableSelect } from "@/components/searchable-select";
import { StatusBadge } from "@/components/status-badge";
import {
  BusinessExpense,
  BusinessProperty,
  expenseKey,
  getInitialExpenses,
  getInitialProperties,
  saveBusinessData
} from "@/lib/business-data";
import { noteSummary } from "@/lib/format";
import { Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const categories = ["房东租金", "维修", "清洁", "家具", "日用品", "税费", "杂费", "其他"];
const emptyExpense: BusinessExpense = {
  id: "",
  propertyId: "",
  expenseMonth: "2026-06",
  category: "房东租金",
  amount: 0,
  paymentDate: "",
  isPaid: true,
  notes: ""
};

export default function ExpensesPage() {
  const [properties, setProperties] = useState<BusinessProperty[]>([]);
  const [expenses, setExpenses] = useState<BusinessExpense[]>([]);
  const [form, setForm] = useState<BusinessExpense>(emptyExpense);
  const [open, setOpen] = useState(false);
  const [propertyFilter, setPropertyFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [expandedNoteId, setExpandedNoteId] = useState("");

  useEffect(() => {
    const loadedProperties = getInitialProperties();
    setProperties(loadedProperties);
    setExpenses(getInitialExpenses(loadedProperties));
  }, []);

  useEffect(() => {
    if (expenses.length) saveBusinessData(expenseKey, expenses);
  }, [expenses]);

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

  function close() {
    setOpen(false);
    setForm(emptyExpense);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.propertyId) return;
    if (form.id) {
      setExpenses((current) => current.map((expense) => (expense.id === form.id ? form : expense)));
    } else {
      setExpenses((current) => [{ ...form, id: crypto.randomUUID() }, ...current]);
    }
    close();
  }

  function remove(id: string) {
    if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return;
    setExpenses((current) => current.filter((expense) => expense.id !== id));
  }

  return (
    <AppLayout title="支出管理" description="管理支出记录，支持按房源、类别、月份筛选。">
      <section className="card panel">
        <div className="panel-header">
          <div><h2 className="panel-title">支出列表</h2><p className="muted">完整支出 CRUD 和筛选。</p></div>
          <button className="btn primary" onClick={() => setOpen(true)} type="button"><Plus size={17} /> 新增支出</button>
        </div>
        <div className="list-controls">
          <select value={propertyFilter} onChange={(event) => setPropertyFilter(event.target.value)}><option value="">全部房源</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="">全部类别</option>{categories.map((category) => <option key={category} value={category}>{category}</option>)}</select>
          <label className="search-box"><input placeholder="筛选月份，例如 2026-06" value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} /></label>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>月份</th><th>房源</th><th>类别</th><th>金额</th><th>付款日期</th><th>状态</th><th>备注</th><th>操作</th></tr></thead>
            <tbody>{visibleExpenses.map((expense) => (
              <tr key={expense.id}>
                <td>{expense.expenseMonth}</td>
                <td>{properties.find((property) => property.id === expense.propertyId)?.name || "-"}</td>
                <td>{expense.category}</td>
                <td>€{expense.amount}</td>
                <td>{expense.paymentDate || "-"}</td>
                <td><StatusBadge tone={expense.isPaid ? "green" : "red"}>{expense.isPaid ? "已支付" : "未支付"}</StatusBadge></td>
                <td title={expense.notes || ""}>{noteSummary(expense.notes)}</td>
                <td><div className="top-actions"><button className="btn" onClick={() => { setForm(expense); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button><button className="btn danger" onClick={() => remove(expense.id)} type="button"><Trash2 size={15} /> 删除</button></div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mobile-card-list">
          {visibleExpenses.map((expense) => {
            const property = properties.find((item) => item.id === expense.propertyId);
            const expanded = expandedNoteId === expense.id;
            return (
              <article className="mobile-record-card" key={expense.id}>
                <div className="mobile-record-title">
                  <strong>{property?.name || "-"}</strong>
                  <span>{expense.category} · €{expense.amount}</span>
                </div>
                <div className="mobile-record-fields">
                  <div className="mobile-record-field"><span>月份</span><strong>{expense.expenseMonth}</strong></div>
                  <div className="mobile-record-field"><span>付款日期</span><strong>{expense.paymentDate || "-"}</strong></div>
                  <div className="mobile-record-field"><span>状态</span><strong><StatusBadge tone={expense.isPaid ? "green" : "red"}>{expense.isPaid ? "已支付" : "未支付"}</StatusBadge></strong></div>
                  <div className="mobile-record-field"><span>备注</span><strong>{expanded ? expense.notes || "-" : noteSummary(expense.notes)} {expense.notes && expense.notes.length > 10 ? <button className="note-expand" onClick={() => setExpandedNoteId(expanded ? "" : expense.id)} type="button">{expanded ? "收起" : "展开"}</button> : null}</strong></div>
                </div>
                <div className="top-actions">
                  <button className="btn" onClick={() => { setForm(expense); setOpen(true); }} type="button"><Edit3 size={15} /> 编辑</button>
                  <button className="btn danger" onClick={() => remove(expense.id)} type="button"><Trash2 size={15} /> 删除</button>
                </div>
              </article>
            );
          })}
        </div>
        <PaginationControls page={page} pageSize={pageSize} total={filteredExpenses.length} onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
      </section>

      {open ? (
        <div className="modal-backdrop" onMouseDown={close}>
          <section className="card modal-card" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header"><h2 className="panel-title">{form.id ? "编辑支出" : "新增支出"}</h2><button className="btn" onClick={close} type="button"><X size={17} /> 关闭</button></div>
            <form className="form-grid" onSubmit={submit}>
              <SearchableSelect label="房源" value={form.propertyId} options={properties.map((property) => ({ value: property.id, label: property.name, description: `${property.city} · ${property.address}`, keywords: `${property.address} ${property.city}` }))} onChange={(propertyId) => setForm((current) => ({ ...current, propertyId }))} />
              <SearchableSelect label="支出类别" value={form.category} options={categories.map((category) => ({ value: category, label: category }))} onChange={(category) => setForm((current) => ({ ...current, category }))} />
              <div className="field"><label>月份</label><input value={form.expenseMonth} onChange={(event) => setForm((current) => ({ ...current, expenseMonth: event.target.value }))} /></div>
              <div className="field"><label>金额</label><input type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: Number(event.target.value) }))} /></div>
              <div className="field"><label>付款日期</label><input type="date" value={form.paymentDate} onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))} /></div>
              <SearchableSelect label="是否已支付" value={form.isPaid ? "已支付" : "未支付"} options={["已支付", "未支付"].map((status) => ({ value: status, label: status }))} onChange={(status) => setForm((current) => ({ ...current, isPaid: status === "已支付" }))} />
              <div className="field" style={{ gridColumn: "1 / -1" }}><label>备注</label><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></div>
              <div className="modal-actions"><button className="btn" onClick={close} type="button">取消</button><button className="btn primary" type="submit">保存</button></div>
            </form>
          </section>
        </div>
      ) : null}
    </AppLayout>
  );
}
