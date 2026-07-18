import { createClient, type Session } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true
      }
    })
  : null;

let sessionRefreshRequest: Promise<Session | null> | null = null;

/**
 * Returns a usable persisted Supabase session and coalesces refresh-token
 * rotation across auth checks and business requests after a mobile app resume.
 */
export async function getValidSupabaseSession(forceRefresh = false): Promise<Session | null> {
  if (!supabase) return null;

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const session = data.session;
  const expiresSoon = !session?.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 60;
  if (!forceRefresh && session && !expiresSoon) return session;
  if (!session) return null;

  if (!sessionRefreshRequest) {
    sessionRefreshRequest = supabase.auth.refreshSession(session).then(({ data: refreshed, error: refreshError }) => {
      if (refreshError) throw refreshError;
      return refreshed.session;
    }).finally(() => {
      sessionRefreshRequest = null;
    });
  }

  return sessionRefreshRequest;
}
