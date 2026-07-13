"use client";

import { AppLayout } from "@/components/app-layout";
import { ACCOUNT_MODULES, emptyModulePermissions, emptySensitivePermissions, SENSITIVE_PERMISSIONS, type ModulePermission, type SensitivePermissions } from "@/lib/account-permissions";
import { supabase } from "@/lib/supabase";
import { KeyRound, LockKeyhole, Plus, RotateCcw, Save, ShieldCheck, UserRoundCheck, UserRoundX, UsersRound } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type PropertyOption = { id: string; name: string; address?: string; city?: string };
type AccountItem = {
  id: string;
  username: string;
  displayName: string;
  accountType: "owner" | "custom";
  status: "active" | "disabled";
  propertyAccessMode: "all" | "selected";
  propertyIds: string[];
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  latestActionAt: string | null;
  modulePermissions: ModulePermission[];
  sensitivePermissions: SensitivePermissions;
};

type EditorState = {
  id: string | null;
  username: string;
  displayName: string;
  password: string;
  passwordConfirmation: string;
  status: "active" | "disabled";
  mustChangePassword: boolean;
  propertyAccessMode: "all" | "selected";
  propertyIds: string[];
  modulePermissions: ModulePermission[];
  sensitivePermissions: SensitivePermissions;
};

function blankEditor(): EditorState {
  return {
    id: null,
    username: "",
    displayName: "",
    password: "",
    passwordConfirmation: "",
    status: "active",
    mustChangePassword: false,
    propertyAccessMode: "selected",
    propertyIds: [],
    modulePermissions: emptyModulePermissions(),
    sensitivePermissions: emptySensitivePermissions()
  };
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [editor, setEditor] = useState<EditorState>(blankEditor());
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");

  const activeAccount = useMemo(() => accounts.find((account) => account.id === editor.id) || null, [accounts, editor.id]);

  const request = useCallback(async (url: string, init: RequestInit = {}) => {
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    if (!data.session) throw new Error("登录已失效，请重新登录。");
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        "Content-Type": "application/json",
        ...(init.headers || {})
      }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "操作失败，请稍后重试。");
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const me = await request("/api/accounts/me");
      setIsOwner(Boolean(me.isOwner));
      if (!me.isOwner) return;
      const payload = await request("/api/accounts");
      setAccounts(payload.accounts || []);
      setProperties(payload.properties || []);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "加载账号资料失败。");
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => {
    load().catch(() => undefined);
  }, [load]);

  function startCreate() {
    setEditor(blankEditor());
    setResetPassword("");
    setResetConfirmation("");
    setNotice("");
  }

  function startEdit(account: AccountItem) {
    setEditor({
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      password: "",
      passwordConfirmation: "",
      status: account.status,
      mustChangePassword: account.mustChangePassword,
      propertyAccessMode: account.propertyAccessMode,
      propertyIds: account.propertyIds,
      modulePermissions: account.modulePermissions,
      sensitivePermissions: account.sensitivePermissions
    });
    setResetPassword("");
    setResetConfirmation("");
    setNotice("");
  }

  function updatePermission(moduleKey: string, field: keyof Omit<ModulePermission, "moduleKey">, value: boolean) {
    setEditor((current) => ({
      ...current,
      modulePermissions: current.modulePermissions.map((item) => {
        if (item.moduleKey !== moduleKey) return item;
        const next = { ...item, [field]: value };
        if (field === "canView" && !value) return { ...next, canCreate: false, canEdit: false, canArchive: false, canDelete: false };
        if (field !== "canView" && value) return { ...next, canView: true };
        return next;
      })
    }));
  }

  async function saveAccount() {
    setSaving(true);
    setNotice("");
    try {
      const body = {
        username: editor.username,
        displayName: editor.displayName,
        password: editor.password,
        passwordConfirmation: editor.passwordConfirmation,
        status: editor.status,
        mustChangePassword: editor.mustChangePassword,
        propertyAccessMode: editor.propertyAccessMode,
        propertyIds: editor.propertyIds,
        modulePermissions: editor.modulePermissions,
        sensitivePermissions: editor.sensitivePermissions
      };
      if (editor.id) await request(`/api/accounts/${editor.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await request("/api/accounts", { method: "POST", body: JSON.stringify(body) });
      await load();
      setNotice(editor.id ? "账号权限已保存。房源范围变更会要求该账号重新登录。" : "自定义账号已创建。请将登录账号和初始密码安全告知使用人。");
      if (!editor.id) setEditor(blankEditor());
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败。");
    } finally {
      setSaving(false);
    }
  }

  async function accountSecurity(action: "reset_password" | "disable" | "enable" | "force_sign_out") {
    if (!editor.id) return;
    const message = action === "disable" ? "确定停用此账号吗？该账号会立即无法继续使用。" : action === "force_sign_out" ? "确定强制该账号退出全部设备吗？" : action === "reset_password" ? "确定重置该账号密码吗？旧会话会被撤销。" : "确定重新启用此账号吗？";
    if (!window.confirm(message)) return;
    setSaving(true);
    try {
      await request(`/api/accounts/${editor.id}/security`, {
        method: "POST",
        body: JSON.stringify({ action, password: resetPassword, passwordConfirmation: resetConfirmation })
      });
      await load();
      setNotice("账号安全操作已完成。");
      setResetPassword("");
      setResetConfirmation("");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "账号安全操作失败。");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AppLayout title="账号与权限" description="正在加载账号授权资料。"><section className="card panel">正在加载...</section></AppLayout>;
  }

  if (!isOwner) {
    return <AppLayout title="账号与权限" description="账号管理仅对主管理员开放。"><section className="card panel"><p className="danger-text">没有权限访问账号与权限管理。</p></section></AppLayout>;
  }

  return (
    <AppLayout title="账号与权限" description="主管理员创建自定义账号、设置房源范围和最小权限。">
      <section className="card panel account-list-panel">
        <div className="panel-header">
          <div><h2 className="panel-title">账号列表</h2><p className="muted">账号只支持启用或停用，历史日志始终保留。</p></div>
          <button className="btn primary" type="button" onClick={startCreate}><Plus size={17} /> 新建账号</button>
        </div>
        <div className="account-list">
          {accounts.map((account) => (
            <button className={`account-row ${editor.id === account.id ? "selected" : ""}`} type="button" key={account.id} onClick={() => startEdit(account)}>
              <span><strong>{account.displayName}</strong><small>{account.username}</small></span>
              <span><b>{account.accountType === "owner" ? "主管理员" : "自定义账号"}</b><small>{account.propertyAccessMode === "all" ? "全部房源" : `指定${account.propertyIds.length}套`}</small></span>
              <span className={`badge ${account.status === "active" ? "success" : "danger"}`}>{account.status === "active" ? "已启用" : "已停用"}</span>
              <small>{account.lastLoginAt ? `登录 ${formatTime(account.lastLoginAt)}` : "尚未登录"}{account.latestActionAt ? ` · 最近操作 ${formatTime(account.latestActionAt)}` : ""}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="card panel account-editor">
        <div className="panel-header"><div><h2 className="panel-title">{editor.id ? "编辑自定义账号" : "新建自定义账号"}</h2><p className="muted">默认没有任何权限和房源范围，必须由主管理员主动授权。</p></div>{editor.id ? <button className="btn" type="button" onClick={startCreate}><Plus size={16} /> 新建</button> : null}</div>
        {activeAccount?.accountType === "owner" ? <p className="muted">主管理员资料受数据库保护，不可在此修改。</p> : (
          <>
            <details className="account-section" open><summary>基本资料</summary><div className="form-grid">
              <div className="field"><label>登录账号</label><input value={editor.username} onChange={(event) => setEditor({ ...editor, username: event.target.value })} placeholder="例如 zhangsan" /></div>
              <div className="field"><label>显示名称</label><input value={editor.displayName} onChange={(event) => setEditor({ ...editor, displayName: event.target.value })} placeholder="例如 张三" /></div>
              {!editor.id ? <><div className="field"><label>初始密码</label><input type="password" value={editor.password} onChange={(event) => setEditor({ ...editor, password: event.target.value })} /></div><div className="field"><label>确认密码</label><input type="password" value={editor.passwordConfirmation} onChange={(event) => setEditor({ ...editor, passwordConfirmation: event.target.value })} /></div></> : null}
              {!editor.id ? <div className="field"><label>账号状态</label><div className="account-choice-row"><label className="checkbox-line"><input type="radio" name="account-status" checked={editor.status === "active"} onChange={() => setEditor({ ...editor, status: "active" })} /> 启用</label><label className="checkbox-line"><input type="radio" name="account-status" checked={editor.status === "disabled"} onChange={() => setEditor({ ...editor, status: "disabled" })} /> 停用</label></div></div> : null}
              <label className="checkbox-line"><input type="checkbox" checked={editor.mustChangePassword} onChange={(event) => setEditor({ ...editor, mustChangePassword: event.target.checked })} /> 首次登录后要求修改密码</label>
            </div></details>

            <details className="account-section" open><summary>房源范围</summary><div className="account-choice-row"><label className="checkbox-line"><input type="radio" name="property-mode" checked={editor.propertyAccessMode === "all"} onChange={() => setEditor({ ...editor, propertyAccessMode: "all", propertyIds: [] })} /> 全部房源</label><label className="checkbox-line"><input type="radio" name="property-mode" checked={editor.propertyAccessMode === "selected"} onChange={() => setEditor({ ...editor, propertyAccessMode: "selected" })} /> 指定房源</label></div>
              {editor.propertyAccessMode === "selected" ? <div className="property-check-list">{properties.map((property) => <label className="checkbox-line" key={property.id}><input type="checkbox" checked={editor.propertyIds.includes(property.id)} onChange={(event) => setEditor({ ...editor, propertyIds: event.target.checked ? [...editor.propertyIds, property.id] : editor.propertyIds.filter((id) => id !== property.id) })} /> <span><strong>{property.name}</strong><small>{[property.city, property.address].filter(Boolean).join(" · ")}</small></span></label>)}</div> : null}
            </details>

            <details className="account-section" open><summary>模块权限</summary><div className="account-permission-tools"><button type="button" className="btn" onClick={() => setEditor({ ...editor, modulePermissions: editor.modulePermissions.map((item) => item.moduleKey === "accounts" ? item : ({ ...item, canView: true })) })}>全选查看</button><button type="button" className="btn" onClick={() => setEditor({ ...editor, modulePermissions: emptyModulePermissions() })}>清空全部权限</button></div><div className="permission-matrix">{ACCOUNT_MODULES.map((module) => { const permission = editor.modulePermissions.find((item) => item.moduleKey === module.key)!; return <div className="permission-row" key={module.key}><strong>{module.label}</strong>{(["canView", "canCreate", "canEdit", "canArchive", "canDelete"] as const).map((field) => <label key={field} className={module.actions.includes(field.replace("can", "").toLowerCase() as never) ? "" : "permission-hidden"}><input type="checkbox" disabled={module.key === "accounts" || !module.actions.includes(field.replace("can", "").toLowerCase() as never)} checked={permission[field]} onChange={(event) => updatePermission(module.key, field, event.target.checked)} /><span>{field === "canView" ? "查看" : field === "canCreate" ? "新增" : field === "canEdit" ? "编辑" : field === "canArchive" ? "归档" : "删除"}</span></label>)}</div>; })}</div></details>

            <details className="account-section"><summary>敏感权限</summary><div className="sensitive-permission-grid">{SENSITIVE_PERMISSIONS.map((item) => <label className="checkbox-line" key={item.key}><input type="checkbox" checked={editor.sensitivePermissions[item.key]} disabled={item.key === "canManageAccounts"} onChange={(event) => setEditor({ ...editor, sensitivePermissions: { ...editor.sensitivePermissions, [item.key]: event.target.checked } })} /> {item.label}</label>)}</div></details>

            {editor.id ? <details className="account-section"><summary>账号安全</summary><div className="form-grid"><div className="field"><label>新密码</label><input type="password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></div><div className="field"><label>确认新密码</label><input type="password" value={resetConfirmation} onChange={(event) => setResetConfirmation(event.target.value)} /></div></div><div className="settings-actions"><button className="btn" type="button" disabled={saving} onClick={() => accountSecurity("reset_password")}><KeyRound size={16} /> 重置密码</button><button className="btn" type="button" disabled={saving} onClick={() => accountSecurity("force_sign_out")}><RotateCcw size={16} /> 强制退出</button>{activeAccount?.status === "active" ? <button className="btn danger" type="button" disabled={saving} onClick={() => accountSecurity("disable")}><UserRoundX size={16} /> 停用账号</button> : <button className="btn primary" type="button" disabled={saving} onClick={() => accountSecurity("enable")}><UserRoundCheck size={16} /> 重新启用</button>}</div></details> : null}

            <div className="account-save-bar"><button className="btn primary" type="button" disabled={saving} onClick={saveAccount}><Save size={17} /> {saving ? "保存中..." : editor.id ? "保存账号与权限" : "创建自定义账号"}</button>{notice ? <p className={notice.includes("失败") || notice.includes("错误") ? "danger-text" : "success-text"}>{notice}</p> : null}</div>
          </>
        )}
      </section>
    </AppLayout>
  );
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}
