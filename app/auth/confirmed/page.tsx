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
      if (supabase) {
        const auth = supabase.auth;
        let resolveAuthEvent: (() => void) | null = null;
        const authEvent = new Promise<void>((resolve) => { resolveAuthEvent = resolve; });
        const { data: listener } = auth.onAuthStateChange((event) => {
          if (event === "SIGNED_IN" || event === "PASSWORD_RECOVERY" || event === "INITIAL_SESSION") {
            resolveAuthEvent?.();
          }
        });
        try {
          const code = new URLSearchParams(window.location.search).get("code");
          if (code) {
            await auth.exchangeCodeForSession(code).catch(() => undefined);
          }
          await Promise.race([
            authEvent,
            new Promise<void>((resolve) => window.setTimeout(resolve, 1500))
          ]);
          await auth.getSession().catch(() => undefined);
        } finally {
          listener.subscription.unsubscribe();
          // The confirmation session proves the email, but must never become
          // an application login. Password login creates the real session.
          await auth.signOut({ scope: "local" }).catch(() => undefined);
        }
      }
      if (!cancelled) window.location.replace("/login?verified=1");
    };
    void finish();
    return () => { cancelled = true; };
  }, []);

  return <main className="login-page"><section className="card login-card"><p className="muted">正在确认邮箱并返回登录页…</p></section></main>;
}
