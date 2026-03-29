import { createClient } from "@supabase/supabase-js";

const env = (typeof import.meta !== "undefined" && import.meta.env) || {};
const url = env.VITE_SUPABASE_URL || undefined;
const anonKey = env.VITE_SUPABASE_ANON_KEY || undefined;
const ACCESS_TOKEN_REFRESH_WINDOW_MS = 60 * 1000;

export const isSupabaseEnabled = Boolean(url && anonKey);
export const supabase = isSupabaseEnabled ? createClient(url, anonKey) : null;
export const isPublicDemoModeEnabled =
  String(env.VITE_PUBLIC_DEMO_MODE || "").toLowerCase() === "true" ||
  ((typeof location !== "undefined" && new URLSearchParams(location.search).get("demo")) || "") === "1";

export async function getSupabaseSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

export async function refreshSupabaseSession() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.refreshSession();
  if (error) throw error;
  return data.session || null;
}

export async function getSupabaseAccessToken(options = {}) {
  if (!supabase) return null;

  const forceRefresh = Boolean(options.forceRefresh);
  let session = forceRefresh ? await refreshSupabaseSession() : await getSupabaseSession();
  const expiresAtMs = Number(session?.expires_at || 0) * 1000;

  if (!session?.access_token || (expiresAtMs && expiresAtMs <= Date.now() + ACCESS_TOKEN_REFRESH_WINDOW_MS)) {
    session = await refreshSupabaseSession();
  }

  return session?.access_token || null;
}

export async function getSupabaseUser() {
  const session = await getSupabaseSession();
  return session?.user || null;
}

export async function getPortfolioControlUserId() {
  if (isSupabaseEnabled && !isPublicDemoModeEnabled) {
    const user = await getSupabaseUser();
    return user?.id || null;
  }
  const user = await getSupabaseUser();
  return user?.id || env.VITE_PORTFOLIO_CONTROL_USER_ID || null;
}

export function subscribeToSupabaseAuth(callback) {
  if (!supabase) return () => {};
  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });
  return () => subscription.unsubscribe();
}

export async function signInWithPassword({ email, password }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
}

export async function signUpWithPassword({ email, password }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo:
        typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined,
    },
  });
  if (error) throw error;
  return data;
}

export async function requestPasswordReset({ email }) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo:
      typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}` : undefined,
  });
  if (error) throw error;
}

export async function signOutSupabaseUser() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
