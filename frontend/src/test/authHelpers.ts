export const TEST_SUPABASE_URL = "https://test.supabase.co";
export const TEST_SUPABASE_ANON_KEY = "test-anon-key";
export const TEST_SUPABASE_STORAGE_KEY = "sb-test-auth-token";

interface SeedSessionOptions {
  accessToken: string;
  email?: string;
  userId?: string;
  expiresInSeconds?: number;
}

export function buildSupabaseSessionPayload({
  accessToken,
  email,
  userId,
  expiresInSeconds = 3600,
}: SeedSessionOptions) {
  const resolvedEmail =
    email ??
    (accessToken === "tok-dual"
      ? "curador@fitness.test"
      : accessToken === "tok-pending"
        ? "nuevo@fitness.test"
        : "atleta@fitness.test");
  const resolvedUserId =
    userId ??
    (accessToken === "tok-dual"
      ? "22222222-2222-2222-2222-222222222222"
      : accessToken === "tok-pending"
        ? "99999999-9999-9999-9999-999999999999"
        : "11111111-1111-1111-1111-111111111111");

  const nowSeconds = Math.floor(Date.now() / 1000);
  return {
    access_token: accessToken,
    token_type: "bearer",
    expires_in: expiresInSeconds,
    expires_at: nowSeconds + expiresInSeconds,
    refresh_token: `refresh-${accessToken}`,
    user: {
      id: resolvedUserId,
      aud: "authenticated",
      role: "authenticated",
      email: resolvedEmail,
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

/**
 * Seeds a valid Supabase Auth session in localStorage for tests that start
 * already authenticated (simulating a returning Athlete or Curator).
 */
export function seedSupabaseSession(
  accessToken: string,
  options?: { email?: string; userId?: string },
): void {
  const session = buildSupabaseSessionPayload({
    accessToken,
    email: options?.email,
    userId: options?.userId,
  });
  window.localStorage.setItem(TEST_SUPABASE_STORAGE_KEY, JSON.stringify(session));
}
