import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { cleanup } from "@testing-library/react";
import { server } from "./msw/server";
import { configureApiClient, resetApiClientState } from "../api/client";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.localStorage.clear();
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
