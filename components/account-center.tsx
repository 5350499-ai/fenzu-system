"use client";

import { Check, Eye, EyeOff, KeyRound, LogOut, Pencil, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { clearAccountAccessSnapshot, useAccountAccess } from "@/components/account-access";

export function AccountCenter() {
  const router = useRouter();
  const access = useAccountAccess();
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [notice, setNotice] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [savingDisplayName, setSavingDisplayName] = useState(false);
  const [displayNameNotice, setDisplayNameNotice] = useState("");

  function openCenter() {
    setOpen(true);
    setNotice("");
    setDisplayNameNotice("");
    setEditingDisplayName(false);
    setDisplayNameDraft(access.profileDisplayName || "用户");
  }

  function beginDisplayNameEdit() {
    setDisplayNameDraft(access.profileDisplayName || "用户");
    setDisplayNameNotice("");
    setEditingDisplayName(true);
  }

  async function saveDisplayName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const displayName = displayNameDraft.trim();
    if (!displayName) {
      setDisplayNameNotice("显示名称不能为空。");
      return;
    }
    if (displayName.length > 80) {
      setDisplayNameNotice("显示名称不能超过80个字符。");
      return;
    }

    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    if (!data.session) {
      setDisplayNameNotice("登录已失效，请重新登录。");
      return;
    }

    setSavingDisplayName(true);
    setDisplayNameNotice("");
    try {
      const response = await fetch("/api/accounts/me", {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ displayName })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setDisplayNameNotice(payload.error || "显示名称保存失败，请稍后重试。");
        return;
      }
      await access.refresh();
      setDisplayNameDraft(payload.displayName || displayName);
      setDisplayNameNotice("显示名称已保存。");
      setEditingDisplayName(false);
    } catch {
      setDisplayNameNotice("显示名称保存失败，请稍后重试。");
    } finally {
      setSavingDisplayName(false);
    }
  }

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      const { data } = await supabase?.auth.getSession() || { data: { session: null } };
      if (data.session) {
        await fetch("/api/auth/logout", {
          method: "POST",
          headers: { Authorization: `Bearer ${data.session.access_token}` }
        }).catch(() => undefined);
      }
      clearAccountAccessSnapshot();
      await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
    } finally {
      router.replace("/login");
    }
  }

  async function changePassword(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice("");

    if (newPassword.length < 8) {
      setNotice("新密码至少需要8位。");
      return;
    }
    if (newPassword !== confirmation) {
      setNotice("两次输入的新密码不一致。");
      return;
    }
    if (newPassword === currentPassword) {
      setNotice("新密码不能与当前密码相同。");
      return;
    }

    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    if (!data.session) {
      setNotice("登录已失效，请重新登录。");
      return;
    }

    setChanging(true);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          passwordConfirmation: confirmation
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNotice(payload.error || "密码修改失败，请稍后重试。");
        return;
      }

      setNotice("密码修改成功，请重新登录。");
      clearAccountAccessSnapshot();
      await supabase?.auth.signOut({ scope: "local" });
      window.setTimeout(() => router.replace("/login"), 500);
    } catch {
      setNotice("密码修改失败，请稍后重试。");
    } finally {
      setChanging(false);
    }
  }

  return (
    <>
      <button className="zanjia-avatar-button" onClick={openCenter} type="button" aria-label="个人中心">
        <UserRound size={20} />
      </button>
      {open ? (
        <div className="modal-backdrop account-center-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="card modal-card account-center-card" role="dialog" aria-modal="true" aria-label="个人中心">
            <div className="panel-header account-center-header">
              <div><h2 className="panel-title">个人中心</h2><p className="muted">管理当前登录账号和会话。</p></div>
              <button className="account-center-close" type="button" onClick={() => setOpen(false)} aria-label="关闭个人中心"><X size={20} /></button>
            </div>
            <div className="account-center-scroll">
              <div className="account-center-summary">
                <div className="account-center-summary-item account-center-name-row">
                  <span>显示名称<strong title={access.profileDisplayName || "用户"}>{access.profileDisplayName || "用户"}</strong></span>
                  {!editingDisplayName ? <button className="account-center-edit-name" type="button" onClick={beginDisplayNameEdit}><Pencil size={14} />修改</button> : null}
                </div>
                {editingDisplayName ? (
                  <form className="account-center-name-editor" onSubmit={saveDisplayName}>
                    <label htmlFor="account-center-display-name">新的显示名称</label>
                    <input id="account-center-display-name" autoComplete="nickname" maxLength={80} value={displayNameDraft} onChange={(event) => setDisplayNameDraft(event.target.value)} autoFocus />
                    <div className="account-center-inline-actions">
                      <button className="btn compact" type="button" disabled={savingDisplayName} onClick={() => { setEditingDisplayName(false); setDisplayNameNotice(""); }}>取消</button>
                      <button className="btn primary compact" type="submit" disabled={savingDisplayName} aria-busy={savingDisplayName}><Check size={15} />{savingDisplayName ? "保存中…" : "保存"}</button>
                    </div>
                  </form>
                ) : null}
                {displayNameNotice ? <p className={displayNameNotice.includes("已保存") ? "success-text account-center-name-notice" : "danger-text account-center-name-notice"} role="status">{displayNameNotice}</p> : null}
                <div className="account-center-summary-item"><span>登录账号<strong title={access.profileUsername || ""}>{access.profileUsername || "-"}</strong></span></div>
                <div className="account-center-summary-item"><span>账号类型<strong>{access.isOwner ? "主管理员" : access.isFreeSingle ? "普通用户" : "受管账号"}</strong></span></div>
                <div className="account-center-summary-item"><span>账号状态<strong className={access.accountStatus === "disabled" ? "danger-text" : "success-text"}>{access.accountStatus === "disabled" ? "已停用" : "已启用"}</strong></span></div>
              </div>
              <details className="account-section account-center-password-section" open>
                <summary><KeyRound size={16} /> 修改密码</summary>
                <form className="form-grid account-center-password-form" onSubmit={changePassword}>
                  <PasswordField label="当前密码" value={currentPassword} onChange={setCurrentPassword} show={showPasswords} current />
                  <PasswordField label="新密码" value={newPassword} onChange={setNewPassword} show={showPasswords} />
                  <PasswordField label="确认新密码" value={confirmation} onChange={setConfirmation} show={showPasswords} />
                  <button className="btn account-center-show-password" type="button" onClick={() => setShowPasswords((value) => !value)}>
                    {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                    {showPasswords ? "隐藏密码" : "显示密码"}
                  </button>
                  {notice ? <p className={notice.includes("成功") ? "success-text" : "danger-text"}>{notice}</p> : null}
                  <div className="modal-actions account-center-password-actions">
                    <button className="btn" type="button" onClick={() => setOpen(false)}>取消</button>
                    <button className="btn primary" disabled={changing} type="submit">{changing ? "修改中..." : "保存新密码"}</button>
                  </div>
                </form>
              </details>
              <div className="modal-actions account-center-logout-actions">
                <button className="btn danger" type="button" onClick={logout} disabled={loggingOut} aria-busy={loggingOut}><LogOut size={16} /> {loggingOut ? "正在退出…" : "退出登录"}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

function PasswordField({
  label,
  value,
  onChange,
  show,
  current = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  show: boolean;
  current?: boolean;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type={show ? "text" : "password"}
        name={current ? "current-password" : label.includes("确认") ? "new-password-confirmation" : "new-password"}
        autoComplete={current ? "current-password" : "new-password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
