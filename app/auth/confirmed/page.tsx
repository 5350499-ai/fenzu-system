"use client";

import { useEffect } from "react";
import { clearAccountAccessSnapshot } from "@/components/account-access";
import { supabase } from "@/lib/supabase";

/**
 * Supabase's browser confirmation flow can briefly establish an implicit
 * session.  It is only evidence of email confirmation, not an application
 * login: discard it before sending the user to the password-login screen.
 */
export default function EmailConfirmedPage() {
  useEffect(() => {
    let cancelled = false;
    const finish = async () => {
      clearAccountAccessSnapshot();
      await supabase?.auth.signOut({ scope: "local" }).catch(() => undefined);
      if (!cancelled) window.location.replace("/login?verified=1");
    };
    void finish();
    return () => { cancelled = true; };
  }, []);

  return <main className="login-page"><section className="card login-card"><p className="muted">正在确认邮箱并返回登录页…</p></section></main>;
}
