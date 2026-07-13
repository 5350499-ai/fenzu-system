import "server-only";

import { createClient } from "@supabase/supabase-js";

function readServerConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase 基础环境变量未配置。");
  }

  return { url, anonKey, serviceRoleKey };
}

// Server-only account tables are introduced by migrations and are intentionally
// not represented by the legacy browser Database type yet.
let adminClient: ReturnType<typeof createClient<any>> | null = null;

export function getSupabaseAdmin() {
  const { url, serviceRoleKey } = readServerConfig();
  if (!serviceRoleKey) {
    throw new Error("服务端账号管理尚未配置，请联系主管理员设置 SUPABASE_SERVICE_ROLE_KEY。");
  }

  if (!adminClient) {
    adminClient = createClient<any>(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
  }

  return adminClient;
}

export function getSupabaseAuthVerifier(accessToken: string) {
  const { url, anonKey } = readServerConfig();
  return createClient<any>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: { Authorization: `Bearer ${accessToken}` }
    }
  });
}

export function getSupabasePublicServerClient() {
  const { url, anonKey } = readServerConfig();
  return createClient<any>(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
