"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Edit3, Plus, Trash2, X } from "lucide-react";
import { loadBusinessData, tenantKey, type BusinessTenant } from "@/lib/business-data";
import { taskStatusLabel, type LocalTaskLike, type ServerTaskLike } from "@/lib/task-management";
import {
  buildLocalMigrationRows,
  recordTaskMigrationResult,
  serverTaskRepository,
  type TaskMigrationPreviewResponse
} from "@/lib/task-repository";
import { TasksLocalMigrationPreview } from "@/components/tasks-local-migration-preview";
import { useAccountAccess } from "@/components/account-access";
import { StatusBadge } from "@/components/status-badge";

type TaskForm = LocalTaskLike & { id: string };

function emptyForm(): TaskForm {
  return { id: crypto.randomUUID(), title: "", dueDate: "", status: "pending", priority: "normal", notes: "", tenantId: "" };
}

function formFromTask(task: ServerTaskLike): TaskForm {
  return {
    id: task.id,
    taskType: task.taskType,
    title: task.title,
    description: task.description,
    dueDate: task.dueDate,
    status: task.status,
    priority: task.priority,
    notes: task.notes,
    tenantId: task.tenantId,
    contractId: task.contractId,
    roomId: task.roomId,
    propertyId: task.propertyId
  };
}

function statusTone(status: string) {
  return status === "completed" ? "green" : status === "cancelled" ? "muted" : "blue";
}

export function TasksServerManager() {
  const access = useAccountAccess();
  const [tasks, setTasks] = useState<ServerTaskLike[]>([]);
  const [tenants, setTenants] = useState<BusinessTenant[]>([]);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [migrationPreview, setMigrationPreview] = useState<TaskMigrationPreviewResponse | null>(null);
  const [migrationTasks, setMigrationTasks] = useState<LocalTaskLike[]>([]);
  const [migrationDismissed, setMigrationDismissed] = useState(false);

  const tenantById = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const [serverRows, tenantRows] = await Promise.all([
          serverTaskRepository.listTasks(),
          loadBusinessData<BusinessTenant>(tenantKey, [])
        ]);
        if (!active) return;
        setTasks(serverRows);
        setTenants(tenantRows);
        const localRows = buildLocalMigrationRows();
        setMigrationTasks(localRows);
        if (localRows.length) setMigrationPreview(await serverTaskRepository.previewMigration(localRows));
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "加载待办失败，请稍后重试。");
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, []);

  function closeForm() {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(false);
  }

  function selectTenant(tenantId: string) {
    const tenant = tenantById.get(tenantId);
    setForm((current) => ({
      ...current,
      tenantId,
      propertyId: tenant?.propertyId || "",
      roomId: tenant?.roomId || "",
      // A manual task should not claim an unrelated historical contract.
      contractId: ""
    }));
  }

  async function saveTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const task = editingId
        ? await serverTaskRepository.updateTask(editingId, form)
        : await serverTaskRepository.createTask(form);
      setTasks((rows) => editingId ? rows.map((row) => row.id === task.id ? task : row) : [task, ...rows]);
      closeForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存待办失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function setTaskStatus(id: string, nextStatus: "completed" | "cancelled") {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const task = nextStatus === "completed" ? await serverTaskRepository.completeTask(id) : await serverTaskRepository.cancelTask(id);
      setTasks((rows) => rows.map((row) => row.id === id ? task : row));
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "保存待办状态失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function removeTask(id: string) {
    if (!window.confirm("确定删除这条待办吗？删除后无法恢复。") || saving) return;
    setSaving(true);
    setError("");
    try {
      await serverTaskRepository.deleteTask(id);
      setTasks((rows) => rows.filter((row) => row.id !== id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除待办失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  async function migrateLocalTasks() {
    if (!migrationPreview || saving) return;
    if (!window.confirm("确认迁移本机待办到服务端吗？本地原始待办会保留为备份。")) return;
    setSaving(true);
    setError("");
    try {
      const result = await serverTaskRepository.executeMigration(migrationTasks, migrationPreview.token);
      recordTaskMigrationResult(migrationTasks, result);
      setMigrationPreview(null);
      setMigrationDismissed(true);
      setTasks(await serverTaskRepository.listTasks());
      if (result.failed) setError(`迁移完成：成功${result.created}条，重复${result.duplicate}条，跳过${result.skipped}条，失败${result.failed}条。可稍后重试失败项。`);
    } catch (migrationError) {
      setError(migrationError instanceof Error ? migrationError.message : "待办迁移失败，请稍后重试。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid" style={{ gap: 18 }}>
      {migrationPreview && !migrationDismissed ? <TasksLocalMigrationPreview preview={migrationPreview} isMigrating={saving} onMigrate={() => void migrateLocalTasks()} onLater={() => setMigrationDismissed(true)} /> : null}
      <section className="card panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">待办列表</h2>
            <p className="muted">当前账号的待办会保存到服务端，并在已授权设备间同步。</p>
          </div>
          {access.can("tasks", "create") ? <button className="btn primary" type="button" disabled={loading || saving} onClick={() => { setForm(emptyForm()); setEditingId(null); setShowForm(true); }}><Plus size={17} />新增待办</button> : null}
        </div>
        {error ? <div className="badge red" style={{ marginBottom: 12 }}>{error}</div> : null}
        {loading ? <p className="muted">正在加载待办…</p> : tasks.length === 0 ? <p className="muted">暂无待办。</p> : <div className="mobile-card-list">
          {tasks.map((task) => (
            <article className="mobile-record-card" key={task.id}>
              <div className="mobile-record-title">
                <strong>{task.title}</strong>
                <StatusBadge tone={statusTone(task.status)}>{taskStatusLabel(task.status)}</StatusBadge>
              </div>
              <div className="mobile-record-fields">
                <div className="mobile-record-field"><span>截止日期</span><strong>{task.dueDate || "未设置"}</strong></div>
                <div className="mobile-record-field"><span>优先级</span><strong>{task.priority || "普通"}</strong></div>
                <div className="mobile-record-field"><span>关联租客</span><strong>{task.tenantId ? tenantById.get(task.tenantId)?.name || "已关联租客" : "普通待办"}</strong></div>
              </div>
              {task.notes ? <p className="muted">{task.notes}</p> : null}
              <div className="top-actions">
                {task.status === "pending" && access.can("tasks", "edit") ? <button className="btn" type="button" disabled={saving} onClick={() => void setTaskStatus(task.id, "completed")}><Check size={15} />完成</button> : null}
                {access.can("tasks", "edit") ? <button className="btn" type="button" disabled={saving} onClick={() => { setForm(formFromTask(task)); setEditingId(task.id); setShowForm(true); }}><Edit3 size={15} />编辑</button> : null}
                {access.can("tasks", "delete") ? <button className="btn danger" type="button" disabled={saving} onClick={() => void removeTask(task.id)}><Trash2 size={15} />删除</button> : null}
              </div>
            </article>
          ))}
        </div>}
      </section>

      {showForm ? <div className="modal-backdrop" role="presentation" onMouseDown={closeForm}>
        <section className="card modal-card" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
          <div className="panel-header"><h2 className="panel-title">{editingId ? "编辑待办" : "新增待办"}</h2><button className="btn" type="button" onClick={closeForm}><X size={17} />关闭</button></div>
          <form className="form-grid" onSubmit={saveTask}>
            <label className="field"><span>待办内容</span><input required value={form.title || ""} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} /></label>
            <label className="field"><span>截止日期</span><input type="date" value={form.dueDate || ""} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} /></label>
            <label className="field"><span>状态</span><select value={form.status || "pending"} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="pending">待处理</option><option value="completed">已完成</option><option value="cancelled">已取消</option></select></label>
            <label className="field"><span>优先级</span><select value={form.priority || "normal"} onChange={(event) => setForm((current) => ({ ...current, priority: event.target.value }))}><option value="low">低</option><option value="normal">普通</option><option value="high">高</option><option value="urgent">紧急</option></select></label>
            <label className="field"><span>关联租客（可选）</span><select value={form.tenantId || ""} onChange={(event) => selectTenant(event.target.value)}><option value="">普通待办</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
            <label className="field"><span>备注</span><textarea value={form.notes || ""} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} /></label>
            <button className="btn primary" disabled={saving} type="submit">{saving ? "正在保存…" : "保存待办"}</button>
          </form>
        </section>
      </div> : null}
    </div>
  );
}
