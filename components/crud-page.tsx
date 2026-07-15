"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Edit3, Plus, Save, Search, Trash2, X } from "lucide-react";
import { loadBusinessData, saveBusinessData } from "@/lib/business-data";
import { useAccountAccess } from "@/components/account-access";

type CrudValue = string | number | boolean | undefined;
type CrudRecord = Record<string, CrudValue> & { id: string };

type Field = {
  name: string;
  label: string;
  type: "text" | "number" | "select" | "checkbox" | "date" | "textarea";
  options?: string[];
};

export function CrudPage({
  title,
  storageKey,
  initialRows,
  fields,
  columns,
  createLabel
}: {
  title: string;
  storageKey: string;
  initialRows: CrudRecord[];
  fields: Field[];
  columns: { name: string; label: string; render?: (row: CrudRecord) => React.ReactNode }[];
  createLabel: string;
}) {
  const access = useAccountAccess();
  const [rows, setRows] = useState<CrudRecord[]>(initialRows);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CrudRecord>(() => createEmpty(fields));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filterField, setFilterField] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    async function load() {
      const loadedRows = await loadBusinessData<CrudRecord>(storageKey, initialRows);
      setRows(loadedRows);
      setLoaded(true);
    }

    load().catch((error) => {
      console.error(`加载${title}失败`, error);
      setErrorMessage(`加载失败：${error.message || error}`);
    });
  }, [storageKey]);

  const isEditing = useMemo(() => Boolean(editingId), [editingId]);
  const searchableFields = columns.map((column) => column.name);
  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;

    const targetFields = filterField ? [filterField] : searchableFields;
    return rows.filter((row) =>
      targetFields.some((field) => String(row[field] ?? "").toLowerCase().includes(keyword))
    );
  }, [filterField, query, rows, searchableFields]);
  const totalPages = Math.max(Math.ceil(filteredRows.length / pageSize), 1);
  const visibleRows = filteredRows.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => {
    setPage(1);
  }, [query, filterField, pageSize]);

  function updateField(name: string, value: CrudValue) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  function reset() {
    setEditingId(null);
    setForm(createEmpty(fields));
    setIsFormOpen(false);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded || saving) return;

    setSaving(true);
    setErrorMessage("");
    const nextRows = editingId
      ? rows.map((row) => (row.id === editingId ? { ...form, id: editingId } : row))
      : [{ ...form, id: crypto.randomUUID() }, ...rows];

    try {
      await saveBusinessData(storageKey, nextRows);
      setRows(nextRows);
      reset();
    } catch (error: any) {
      console.error(`保存${title}失败`, error);
      const message = `保存失败：${error.message || error}`;
      setErrorMessage(message);
      window.alert(message);
    } finally {
      setSaving(false);
    }
  }

  function edit(row: CrudRecord) {
    setEditingId(row.id);
    setForm(row);
    setIsFormOpen(true);
  }

  async function remove(id: string) {
    if (!window.confirm("确定要删除这条记录吗？\n删除后不可恢复。")) return;
    if (!loaded || saving) return;

    const nextRows = rows.filter((row) => row.id !== id);
    setSaving(true);
    setErrorMessage("");

    try {
      await saveBusinessData(storageKey, nextRows);
      setRows(nextRows);
    } catch (error: any) {
      console.error(`删除${title}失败`, error);
      const message = `删除失败：${error.message || error}`;
      setErrorMessage(message);
      window.alert(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">{title}列表</h2>
            <p className="muted">支持搜索、筛选和分页，完整数据在这里查看。</p>
          </div>
          <div className="top-actions">
            <span className="badge blue">{filteredRows.length} 条</span>
            {access.can("tasks", "create") ? <button
              className="btn primary"
              disabled={!loaded || saving}
              type="button"
              onClick={() => {
                setEditingId(null);
                setForm(createEmpty(fields));
                setIsFormOpen(true);
              }}
            >
              <Plus size={17} />
              {createLabel}
            </button> : null}
          </div>
        </div>

        {errorMessage ? <div className="badge red" style={{ marginBottom: 12 }}>{errorMessage}</div> : null}

        <div className="list-controls">
          <label className="search-box">
            <Search size={17} />
            <input placeholder={`搜索${title}`} value={query} onChange={(event) => setQuery(event.target.value)} />
          </label>
          <select value={filterField} onChange={(event) => setFilterField(event.target.value)}>
            <option value="">全部字段</option>
            {columns.map((column) => (
              <option key={column.name} value={column.name}>
                {column.label}
              </option>
            ))}
          </select>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            <option value={10}>每页10条</option>
            <option value={15}>每页15条</option>
            <option value={20}>每页20条</option>
            <option value={50}>每页50条</option>
          </select>
        </div>

        <div className="mobile-card-list">
          {visibleRows.map((row) => (
            <article className="mobile-record-card" key={row.id}>
              <div className="mobile-record-title">
                <strong>{String(row[columns[0]?.name] ?? "-")}</strong>
                {columns[1] ? <span>{String(row[columns[1].name] ?? "-")}</span> : null}
              </div>
              <div className="mobile-record-fields">
                {columns.slice(2).map((column) => (
                  <div className="mobile-record-field" key={column.name}>
                    <span>{column.label}</span>
                    <strong>{column.render ? column.render(row) : String(row[column.name] ?? "-")}</strong>
                  </div>
                ))}
              </div>
              {access.can("tasks", "edit") || access.can("tasks", "delete") ? <div className="top-actions">
                {access.can("tasks", "edit") ? <button className="btn" type="button" onClick={() => edit(row)}>
                  <Edit3 size={15} />
                  编辑
                </button> : null}
                {access.can("tasks", "delete") ? <button className="btn danger" disabled={saving} type="button" onClick={() => remove(row.id)}>
                  <Trash2 size={15} />
                  删除
                </button> : null}
              </div> : null}
            </article>
          ))}
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.name}>{column.label}</th>
                ))}
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.name}>{column.render ? column.render(row) : String(row[column.name] ?? "-")}</td>
                  ))}
                  <td>
                    {access.can("tasks", "edit") || access.can("tasks", "delete") ? <div className="top-actions">
                      {access.can("tasks", "edit") ? <button className="btn" type="button" onClick={() => edit(row)}>
                        <Edit3 size={15} />
                        编辑
                      </button> : null}
                      {access.can("tasks", "delete") ? <button className="btn danger" disabled={saving} type="button" onClick={() => remove(row.id)}>
                        <Trash2 size={15} />
                        删除
                      </button> : null}
                    </div> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pagination">
          <span className="muted">
            第 {page} / {totalPages} 页
          </span>
          <div className="top-actions">
            <button className="btn" disabled={page <= 1} type="button" onClick={() => setPage((current) => current - 1)}>
              <ChevronLeft size={16} />
              上一页
            </button>
            <button
              className="btn"
              disabled={page >= totalPages}
              type="button"
              onClick={() => setPage((current) => current + 1)}
            >
              下一页
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      </section>

      {isFormOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={reset}>
          <section className="card modal-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <div>
                <h2 className="panel-title">{isEditing ? `编辑${title}` : createLabel}</h2>
                <p className="muted">保存成功后窗口会自动关闭。</p>
              </div>
              <button className="btn" type="button" onClick={reset}>
                <X size={17} />
                关闭
              </button>
            </div>
            <form className="form-grid" onSubmit={submit}>
              {fields.map((field) => (
                <div className="field" key={field.name}>
                  <label>{field.label}</label>
                  {field.type === "select" ? (
                    <select value={String(form[field.name] ?? "")} onChange={(event) => updateField(field.name, event.target.value)}>
                      <option value="">请选择</option>
                      {field.options?.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : field.type === "checkbox" ? (
                    <select value={form[field.name] ? "true" : "false"} onChange={(event) => updateField(field.name, event.target.value === "true")}>
                      <option value="true">是</option>
                      <option value="false">否</option>
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea value={String(form[field.name] ?? "")} onChange={(event) => updateField(field.name, event.target.value)} />
                  ) : (
                    <input
                      type={field.type}
                      value={String(form[field.name] ?? "")}
                      onChange={(event) =>
                        updateField(field.name, field.type === "number" ? Number(event.target.value) : event.target.value)
                      }
                    />
                  )}
                </div>
              ))}
              <div className="modal-actions">
                <button className="btn" type="button" onClick={reset}>
                  取消
                </button>
                <button className="btn primary" disabled={saving} type="submit">
                  {isEditing ? <Save size={17} /> : <Plus size={17} />}
                  {saving ? "保存中..." : isEditing ? "保存修改" : createLabel}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function createEmpty(fields: Field[]) {
  return fields.reduce<CrudRecord>(
    (record, field) => {
      record[field.name] = field.type === "number" ? 0 : field.type === "checkbox" ? false : "";
      return record;
    },
    { id: "" }
  );
}
