import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface SupabaseAuthConfig {
  url: string | null;
  anonKey: string | null;
}

let configOverride: SupabaseAuthConfig | null = null;
let cachedClient: SupabaseClient | null = null;
let cachedKey: string | null = null;

function normalizeEnvValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getResolvedConfig(): SupabaseAuthConfig {
  if (configOverride !== null) {
    return {
      url: normalizeEnvValue(configOverride.url),
      anonKey: normalizeEnvValue(configOverride.anonKey),
    };
  }
  return {
    url: normalizeEnvValue(import.meta.env.VITE_SUPABASE_URL),
    anonKey: normalizeEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY),
  };
}

export function getMissingSupabaseEnvVars(): string[] {
  const { url, anonKey } = getResolvedConfig();
  const missing: string[] = [];
  if (!url) missing.push("VITE_SUPABASE_URL");
  if (!anonKey) missing.push("VITE_SUPABASE_ANON_KEY");
  return missing;
}

export function isSupabaseConfigured(): boolean {
  return getMissingSupabaseEnvVars().length === 0;
}

export function configureSupabaseAuth(config: SupabaseAuthConfig | null): void {
  const prev = getResolvedConfig();
  configOverride = config;
  const next = getResolvedConfig();
  if (prev.url !== next.url || prev.anonKey !== next.anonKey) {
    resetSupabaseAuthClient();
  }
}

export function resetSupabaseAuthClient(): void {
  if (cachedClient) {
    void cachedClient.auth.stopAutoRefresh();
  }
  cachedClient = null;
  cachedKey = null;
}

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey } = getResolvedConfig();
  if (!url || !anonKey) {
    return null;
  }
  const key = `${url}::${anonKey}`;
  if (!cachedClient || cachedKey !== key) {
    if (cachedClient) {
      void cachedClient.auth.stopAutoRefresh();
    }
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    cachedKey = key;
  }
  return cachedClient;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) {
    return null;
  }
  const { data } = await client.auth.getSession();
  return data.session?.access_token ?? null;
}
