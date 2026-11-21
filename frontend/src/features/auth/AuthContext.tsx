import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";
import {
  getMissingSupabaseEnvVars,
  getSupabaseClient,
  isSupabaseConfigured,
} from "./supabaseClient";

export type AuthenticatedAthlete = components["schemas"]["AuthMeResponse"];

export type AuthStatus =
  | "loading"
  | "unconfigured"
  | "unauthenticated"
  | "needs_activation"
  | "authenticated";

const PENDING_INVITE_STORAGE_KEY = "fitness_coach_pending_invite";

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

function extractApiErrorDetail(apiError: unknown, fallback: string): string {
  if (typeof apiError === "object" && apiError && "detail" in apiError) {
    return String((apiError as { detail: unknown }).detail);
  }
  return fallback;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isSupabaseConfigured();
  const missingEnvVars = getMissingSupabaseEnvVars();
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<AuthStatus>(
    configured ? "loading" : "unconfigured",
  );
  const [athlete, setAthlete] = useState<AuthenticatedAthlete | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    const fromUrl = searchParams.get("invite")?.trim();
    if (fromUrl) {
      window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    return window.sessionStorage.getItem(PENDING_INVITE_STORAGE_KEY);
  });
  const [error, setError] = useState<string | null>(null);
  const isManualLogoutRef = useRef(false);
  const wasAuthenticatedRef = useRef(false);

  useEffect(() => {
    const fromUrl = searchParams.get("invite")?.trim();
    if (fromUrl) {
      window.sessionStorage.setItem(PENDING_INVITE_STORAGE_KEY, fromUrl);
      setPendingInviteCode(fromUrl);
    }
  }, [searchParams]);

  const clearInviteParamAndStorage = useCallback(() => {
    window.sessionStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    setPendingInviteCode(null);
    if (searchParams.has("invite")) {
      const next = new URLSearchParams(searchParams);
      next.delete("invite");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const verifyBackendAccount = useCallback(async (session: Session | null) => {
    if (!session) {
      setAthlete(null);
      setPendingEmail(null);
      setStatus("unauthenticated");
      wasAuthenticatedRef.current = false;
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
        setAthlete(null);
        setPendingEmail(session.user?.email ?? null);
        setStatus("needs_activation");
        setError(null);
        wasAuthenticatedRef.current = false;
        return false;
      }

      setAthlete(null);
      setPendingEmail(null);
      setStatus("unauthenticated");
      setError("No se pudo verificar la sesión con el servidor.");
      wasAuthenticatedRef.current = false;
      return false;
    } catch {
      // ColdStartBanner already surfaces network_error; preserve Supabase session
      setAthlete(null);
      setPendingEmail(null);
      setStatus("unauthenticated");
      wasAuthenticatedRef.current = false;
      return false;
    }
  }, []);

  const refreshSession = useCallback(async () => {
    const client = getSupabaseClient();
    if (!client) {
      setAthlete(null);
      setPendingEmail(null);
      setStatus("unconfigured");
      return;
    }

    setStatus("loading");
    setError(null);
    const { data, error: sessionError } = await client.auth.getSession();
    if (sessionError || !data.session) {
      setAthlete(null);
      setPendingEmail(null);
      setStatus("unauthenticated");
      wasAuthenticatedRef.current = false;
      return;
    }

    await verifyBackendAccount(data.session);
  }, [verifyBackendAccount]);

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
        setAthlete(null);
        setPendingEmail(null);
        setStatus("unauthenticated");
        setError("Tu sesión ha caducado o dejó de ser válida. Inicia sesión de nuevo.");
        wasAuthenticatedRef.current = false;
        return;
      }
      await verifyBackendAccount(data.session);
    })();

    const { data: subscription } = client.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "SIGNED_OUT") {
        setAthlete(null);
        setPendingEmail(null);
        setStatus("unauthenticated");
        if (wasAuthenticatedRef.current && !isManualLogoutRef.current) {
          setError("Tu sesión ha caducado o dejó de ser válida. Inicia sesión de nuevo.");
        }
        wasAuthenticatedRef.current = false;
        isManualLogoutRef.current = false;
      } else if (event === "TOKEN_REFRESHED" && session && !wasAuthenticatedRef.current) {
        void verifyBackendAccount(session);
      }
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, [verifyBackendAccount]);

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

  const redeemInvitation = useCallback(
    async ({
      invitationToken,
      displayName,
    }: {
      invitationToken: string;
      displayName?: string;
    }): Promise<boolean> => {
      setError(null);
      try {
        const { data, error: apiError } = await apiClient.POST(
          "/api/v1/auth/invitations/redeem",
          {
            body: {
              token: invitationToken.trim(),
              display_name: displayName?.trim() || null,
            },
          },
        );
        if (data) {
          setAthlete(data);
          setPendingEmail(null);
          setStatus("authenticated");
          wasAuthenticatedRef.current = true;
          clearInviteParamAndStorage();
          return true;
        }
        setError(extractApiErrorDetail(apiError, "No se pudo canjear la invitación."));
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al canjear la invitación.");
        return false;
      }
    },
    [clearInviteParamAndStorage],
  );

  const bootstrapCurator = useCallback(
    async ({ displayName }: { displayName?: string }): Promise<boolean> => {
      setError(null);
      try {
        const { data, error: apiError } = await apiClient.POST(
          "/api/v1/auth/bootstrap-curator",
          {
            body: {
              display_name: displayName?.trim() || null,
            },
          },
        );
        if (data) {
          setAthlete(data);
          setPendingEmail(null);
          setStatus("authenticated");
          wasAuthenticatedRef.current = true;
          clearInviteParamAndStorage();
          return true;
        }
        setError(
          extractApiErrorDetail(apiError, "No se pudo activar la cuenta inicial de Curador."),
        );
        return false;
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Error al activar la cuenta inicial de Curador.",
        );
        return false;
      }
    },
    [clearInviteParamAndStorage],
  );

  const logout = useCallback(async () => {
    const client = getSupabaseClient();
    isManualLogoutRef.current = true;
    setAthlete(null);
    setPendingEmail(null);
    setError(null);
    setStatus(client ? "unauthenticated" : "unconfigured");
    wasAuthenticatedRef.current = false;
    if (client) {
      await client.auth.signOut();
    }
  }, []);

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
