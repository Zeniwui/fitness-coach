import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  apiClient,
  clearAuthToken,
  getAuthToken,
  setAuthToken,
} from "../../api/client";
import type { components } from "../../api/generated/schema";

export type AuthenticatedAthlete = components["schemas"]["AuthMeResponse"];

interface AuthContextValue {
  athlete: AuthenticatedAthlete | null;
  loading: boolean;
  error: string | null;
  loginWithToken: (token: string) => Promise<boolean>;
  redeemInvitation: (params: {
    sessionToken: string;
    invitationToken: string;
    displayName?: string;
  }) => Promise<boolean>;
  logout: () => void;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [athlete, setAthlete] = useState<AuthenticatedAthlete | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshSession = useCallback(async () => {
    const token = getAuthToken();
    if (!token) {
      setAthlete(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: apiError } = await apiClient.GET("/api/v1/auth/me");
      if (data) {
        setAthlete(data);
      } else {
        setAthlete(null);
        const detail =
          typeof apiError === "object" && apiError && "detail" in apiError
            ? String((apiError as { detail: unknown }).detail)
            : "Sesión no válida o cuenta sin invitación.";
        setError(detail);
      }
    } catch {
      setAthlete(null);
      setError("No se pudo verificar la sesión con el servidor.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  const loginWithToken = useCallback(
    async (token: string): Promise<boolean> => {
      setAuthToken(token.trim());
      await refreshSession();
      return Boolean(getAuthToken());
    },
    [refreshSession],
  );

  const redeemInvitation = useCallback(
    async ({
      sessionToken,
      invitationToken,
      displayName,
    }: {
      sessionToken: string;
      invitationToken: string;
      displayName?: string;
    }): Promise<boolean> => {
      setAuthToken(sessionToken.trim());
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
          return true;
        }
        const detail =
          typeof apiError === "object" && apiError && "detail" in apiError
            ? String((apiError as { detail: unknown }).detail)
            : "No se pudo canjear la invitación.";
        setError(detail);
        return false;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al canjear invitación.");
        return false;
      }
    },
    [],
  );

  const logout = useCallback(() => {
    clearAuthToken();
    setAthlete(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        athlete,
        loading,
        error,
        loginWithToken,
        redeemInvitation,
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
