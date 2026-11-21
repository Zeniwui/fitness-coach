import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./msw/server";
import { configureApiClient, resetApiClientState } from "../api/client";
import { configureSupabaseAuth } from "../features/auth/supabaseClient";
import { TEST_SUPABASE_ANON_KEY, TEST_SUPABASE_URL } from "./authHelpers";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

beforeEach(() => {
  configureSupabaseAuth({
    url: TEST_SUPABASE_URL,
    anonKey: TEST_SUPABASE_ANON_KEY,
  });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  resetApiClientState();
  configureApiClient({
    coldStartThresholdMs: 2000,
    retryDelayMs: 1200,
    maxGetRetries: 2,
  });
});

afterAll(() => {
  server.close();
});
