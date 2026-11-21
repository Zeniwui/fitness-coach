import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";
import { getSupabaseAccessToken } from "../features/auth/supabaseClient";

export type ConnectionStatus = "idle" | "waking" | "network_error";

export interface ConnectionState {
  status: ConnectionStatus;
  message: string | null;
}

export interface ApiClientConfig {
  baseUrl: string;
  coldStartThresholdMs: number;
  retryDelayMs: number;
  maxGetRetries: number;
}

export class DuplicateSubmissionError extends Error {
  constructor() {
    super("Ya hay una solicitud en curso. Espera un momento antes de reintentar.");
    this.name = "DuplicateSubmissionError";
  }
}

export function extractApiErrorDetail(apiError: unknown, fallback: string): string {
  if (typeof apiError === "object" && apiError && "detail" in apiError) {
    return String((apiError as { detail: unknown }).detail);
  }
  return fallback;
}

const DEFAULT_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  (typeof window !== "undefined" && window.location?.origin
    ? window.location.origin
    : "http://localhost:5173");

const config: ApiClientConfig = {
  baseUrl: DEFAULT_BASE_URL,
  coldStartThresholdMs: 2000,
  retryDelayMs: 1200,
  maxGetRetries: 2,
};

let connectionState: ConnectionState = { status: "idle", message: null };
const listeners = new Set<(state: ConnectionState) => void>();
const inFlightMutations = new Set<string>();

function setConnectionState(next: ConnectionState): void {
  if (
    connectionState.status === next.status &&
    connectionState.message === next.message
  ) {
    return;
  }
  connectionState = next;
  listeners.forEach((listener) => listener(connectionState));
}

export function getConnectionState(): ConnectionState {
  return connectionState;
}

export function subscribeConnectionState(
  listener: (state: ConnectionState) => void,
): () => void {
  listeners.add(listener);
  listener(connectionState);
  return () => {
    listeners.delete(listener);
  };
}

export function configureApiClient(partial: Partial<ApiClientConfig>): void {
  Object.assign(config, partial);
}

export function resetApiClientState(): void {
  inFlightMutations.clear();
  setConnectionState({ status: "idle", message: null });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

export async function coldStartAwareFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const resolvedInput =
    typeof input === "string" && input.startsWith("/")
      ? `${config.baseUrl.replace(/\/$/, "")}${input}`
      : input;
  const request =
    resolvedInput instanceof Request ? resolvedInput : new Request(resolvedInput, init);
  const method = request.method.toUpperCase();
  const isIdempotentGet = method === "GET" || method === "HEAD";
  const mutationKey = `${method}:${request.url}`;

  if (!isIdempotentGet) {
    if (inFlightMutations.has(mutationKey)) {
      throw new DuplicateSubmissionError();
    }
    inFlightMutations.add(mutationKey);
  }

  const token = await getSupabaseAccessToken();
  const headers = new Headers(request.headers);
  if (token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const maxAttempts = isIdempotentGet ? config.maxGetRetries + 1 : 1;
  let lastError: unknown;

  const wakingTimer = setTimeout(() => {
    setConnectionState({
      status: "waking",
      message:
        "Activando servidor tras periodo de inactividad… Esto puede tardar unos segundos.",
    });
  }, config.coldStartThresholdMs);

  try {
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const attemptReq =
          maxAttempts > 1
            ? new Request(request.clone(), { headers })
            : new Request(request, { headers });
        const response = await fetch(attemptReq);

        if (isIdempotentGet && isRetriableStatus(response.status) && attempt < maxAttempts) {
          setConnectionState({
            status: "waking",
            message:
              "Activando servidor tras periodo de inactividad… Reintentando automáticamente.",
          });
          await sleep(config.retryDelayMs);
          continue;
        }

        setConnectionState({ status: "idle", message: null });
        return response;
      } catch (err) {
        lastError = err;
        if (isIdempotentGet && attempt < maxAttempts) {
          await sleep(config.retryDelayMs);
          continue;
        }
        setConnectionState({
          status: "network_error",
          message:
            "Error de conexión con la API. Comprueba tu red e inténtalo de nuevo.",
        });
        throw err;
      }
    }

    throw lastError ?? new Error("Error de conexión inesperado.");
  } finally {
    clearTimeout(wakingTimer);
    if (!isIdempotentGet) {
      inFlightMutations.delete(mutationKey);
    }
  }
}

export const apiClient = createClient<paths>({
  baseUrl: config.baseUrl,
  fetch: coldStartAwareFetch,
});
