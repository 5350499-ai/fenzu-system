"use client";

import { Eye, EyeOff, KeyRound, LogOut, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAccountAccess } from "@/components/account-access";

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

  async function logout() {
    const { data } = await supabase?.auth.getSession() || { data: { session: null } };
    if (data.session) {
      await fetch("/api/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${data.session.access_token}` }
      }).catch(() => undefined);
    }
    await supabase?.auth.signOut({ scope: "local" });
    router.replace("/login");
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
      <button className="zanjia-avatar-button" onClick={() => { setOpen(true); setNotice(""); }} type="button" aria-label="个人中心">
        <UserRound size={20} />
      </button>
      {open ? (
        <div className="modal-backdrop account-center-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="card modal-card account-center-card" role="dialog" aria-modal="true" aria-label="个人中心">
            <div className="panel-header">
              <div><h2 className="panel-title">个人中心</h2><p className="muted">管理当前登录账号和会话。</p></div>
              <button className="icon-btn" type="button" onClick={() => setOpen(false)} aria-label="关闭"><X size={18} /></button>
            </div>
            <div className="account-center-summary">
              <span>显示名称<strong>{access.profileDisplayName || "-"}</strong></span>
              <span>登录账号<strong>{access.profileUsername || "-"}</strong></span>
              <span>账号类型<strong>{access.isOwner ? "主管理员" : "自定义账号"}</strong></span>
              <span>账号状态<strong className="success-text">已启用</strong></span>
            </div>
            <details className="account-section" open>
              <summary><KeyRound size={16} /> 修改密码</summary>
              <form className="form-grid" onSubmit={changePassword}>
                <PasswordField label="当前密码" value={currentPassword} onChange={setCurrentPassword} show={showPasswords} current />
                <PasswordField label="新密码" value={newPassword} onChange={setNewPassword} show={showPasswords} />
                <PasswordField label="确认新密码" value={confirmation} onChange={setConfirmation} show={showPasswords} />
                <button className="btn" type="button" onClick={() => setShowPasswords((value) => !value)}>
                  {showPasswords ? <EyeOff size={16} /> : <Eye size={16} />}
                  {showPasswords ? "隐藏密码" : "显示密码"}
                </button>
                {notice ? <p className={notice.includes("成功") ? "success-text" : "danger-text"}>{notice}</p> : null}
                <div className="modal-actions">
                  <button className="btn" type="button" onClick={() => setOpen(false)}>取消</button>
                  <button className="btn primary" disabled={changing} type="submit">{changing ? "修改中..." : "保存新密码"}</button>
                </div>
              </form>
            </details>
            <div className="modal-actions">
              <button className="btn danger" type="button" onClick={logout}><LogOut size={16} /> 退出登录</button>
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
        autoComplete={current ? "current-password" : "new-password"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
