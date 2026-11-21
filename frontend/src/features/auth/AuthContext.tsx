import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { apiClient, extractApiErrorDetail } from "../../api/client";
import type { components } from "../../api/generated/schema";
import {
  getMissingSupabaseEnvVars,
  getSupabaseClient,
  isSupabaseConfigured,
} from "./supabaseClient";
import { usePendingInviteCode } from "./usePendingInviteCode";

export type AuthenticatedAthlete = components["schemas"]["AuthMeResponse"];

export type AuthStatus =
  | "loading"
  | "unconfigured"
  | "unauthenticated"
  | "needs_activation"
  | "authenticated";

const EXPIRED_SESSION_MESSAGE =
  "Tu sesión ha caducado o dejó de ser válida. Inicia sesión de nuevo.";

interface AuthContextValue {
  status: AuthStatus;
  athlete: AuthenticatedAthlete | null;
  loading: boolean;
  pendingEmail: string | null;
  pendingInviteCode: string | null;
  missingEnvVars: string[];
  error: string | null;
  signInWithPassword: (email: string, password: string) => Promise<boolean>;
  redeemInvitation: (params: {
    invitationToken: string;
    displayName?: string;
  }) => Promise<boolean>;
  bootstrapCurator: (params: { displayName?: string }) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function translateSupabaseAuthError(message: string | undefined): string {
  const normalized = (message ?? "").toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "Correo electrónico o contraseña incorrectos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Tu correo electrónico aún no está confirmado. Contacta con el Curador.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Demasiados intentos. Espera un momento antes de volver a intentarlo.";
  }
  return "No se pudo iniciar sesión. Comprueba tus credenciales e inténtalo de nuevo.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const missingEnvVars = getMissingSupabaseEnvVars();
  const { pendingInviteCode, clearPendingInviteCode } = usePendingInviteCode();

  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "unconfigured",
  );
  const [athlete, setAthlete] = useState<AuthenticatedAthlete | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isManualLogoutRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);

  const clearSessionState = useCallback(
    (
      nextStatus: Exclude<AuthStatus, "authenticated" | "needs_activation">,
      nextError?: string | null,
    ) => {
      setAthlete(null);
      setPendingEmail(null);
      setStatus(nextStatus);
      wasAuthenticatedRef.current = false;
      if (nextError !== undefined) {
        setError(nextError);
      }
    },
    [],
  );

  const verifyBackendAccount = useCallback(
    async (session: Session | null) => {
      if (!session) {
        clearSessionState("unauthenticated");
        return false;
      }

      try {
        const { data, response } = await apiClient.GET("/api/v1/auth/me");
        if (data) {
          setAthlete(data);
          setPendingEmail(null);
          setStatus("authenticated");
          setError(null);
          wasAuthenticatedRef.current = true;
          return true;
        }

        if (response.status === 401) {
          const client = getSupabaseClient();
          const userResult = client ? await client.auth.getUser() : null;
          if (!userResult || userResult.error || !userResult.data.user) {
            if (client) {
              isManualLogoutRef.current = true;
              await client.auth.signOut();
            }
            clearSessionState("unauthenticated", EXPIRED_SESSION_MESSAGE);
            return false;
          }

          setAthlete(null);
          setPendingEmail(session.user?.email ?? userResult.data.user.email ?? null);
          setStatus("needs_activation");
          setError(null);
          wasAuthenticatedRef.current = false;
          return false;
        }

        clearSessionState(
          "unauthenticated",
          "No se pudo verificar la sesión con el servidor.",
        );
        return false;
      } catch {
        // ColdStartBanner already surfaces network_error; preserve Supabase session
        clearSessionState("unauthenticated");
        return false;
      }
    },
    [clearSessionState],
  );

  const refreshSession = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      clearSessionState("unconfigured");
      return;
    }

    setStatus("loading");
    setError(null);
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError || !data.session) {
      clearSessionState("unauthenticated");
      return;
    }

    await verifyBackendAccount(data.session);
  }, [clearSessionState, verifyBackendAccount]);

  useEffect(() => {
    const client = getSupabaseClient();
    if (!client) {
      setStatus("unconfigured");
      return;
    }

    let active = true;

    void (async () => {
      const { data, error: sessionError } = await client.auth.getSession();
      if (!active) return;
      if (sessionError) {
        clearSessionState("unauthenticated", EXPIRED_SESSION_MESSAGE);
        return;
      }
      await verifyBackendAccount(data.session);
    })();

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        const shouldShowExpiredError =
          wasAuthenticatedRef.current && !isManualLogoutRef.current;
        clearSessionState("unauthenticated");
        if (shouldShowExpiredError) {
          setError(EXPIRED_SESSION_MESSAGE);
        }
        isManualLogoutRef.current = false;
      } else if (event === "TOKEN_REFRESHED" && session && !wasAuthenticatedRef.current) {
        void verifyBackendAccount(session);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [clearSessionState, verifyBackendAccount]);

  const signInWithPassword = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const client = getSupabaseClient();
      if (!client) {
        setStatus("unconfigured");
        return false;
      }

      setError(null);
      const { data, error: signInError } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !data.session) {
        setError(translateSupabaseAuthError(signInError?.message));
        return false;
      }

      return verifyBackendAccount(data.session);
    },
    [verifyBackendAccount],
  );

  const runActivation = useCallback(
    async (
      request: () => Promise<{ data?: AuthenticatedAthlete; error?: unknown }>,
      apiFallbackError: string,
      catchFallbackError: string,
    ): Promise<boolean> => {
      setError(null);
      try {
        const { data, error: apiError } = await request();
        if (data) {
          setAthlete(data);
          setPendingEmail(null);
          setStatus("authenticated");
          wasAuthenticatedRef.current = true;
          clearPendingInviteCode();
          return true;
        }
        setError(extractApiErrorDetail(apiError, apiFallbackError));
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : catchFallbackError);
        return false;
      }
    },
    [clearPendingInviteCode],
  );

  const redeemInvitation = useCallback(
    ({
      invitationToken,
      displayName,
    }: {
      invitationToken: string;
      displayName?: string;
    }): Promise<boolean> =>
      runActivation(
        () =>
          apiClient.POST("/api/v1/auth/invitations/redeem", {
            body: {
              token: invitationToken.trim(),
              display_name: displayName?.trim() || null,
            },
          }),
        "No se pudo canjear la invitación.",
        "Error al canjear la invitación.",
      ),
    [runActivation],
  );

  const bootstrapCurator = useCallback(
    ({ displayName }: { displayName?: string }): Promise<boolean> =>
      runActivation(
        () =>
          apiClient.POST("/api/v1/auth/bootstrap-curator", {
            body: {
              display_name: displayName?.trim() || null,
            },
          }),
        "No se pudo activar la cuenta inicial de Curador.",
        "Error al activar la cuenta inicial de Curador.",
      ),
    [runActivation],
  );

  const logout = useCallback(async () => {
    const client = getSupabaseClient();
    isManualLogoutRef.current = true;
    clearSessionState(client ? "unauthenticated" : "unconfigured", null);
    if (client) {
      await client.auth.signOut();
    }
  }, [clearSessionState]);

  return (
    <AuthContext.Provider
      value={{
        status,
        athlete,
        loading: status === "loading",
        pendingEmail,
        pendingInviteCode,
        missingEnvVars,
        error,
        signInWithPassword,
        redeemInvitation,
        bootstrapCurator,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  }
  return ctx;
}
