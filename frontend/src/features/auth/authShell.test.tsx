import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { App } from "../../app/App";
import { server } from "../../test/msw/server";
import { DUAL_ROLE_USER } from "../../test/msw/handlers/identity";
import { configureApiClient } from "../../api/client";
import { configureSupabaseAuth } from "./supabaseClient";
import {
  buildSupabaseSessionPayload,
  seedSupabaseSession,
  TEST_SUPABASE_STORAGE_KEY,
  TEST_SUPABASE_URL,
} from "../../test/authHelpers";

describe("Auth, Supabase Email/Password, Roles, PWA Shell & Cold-Start (#11)", () => {
  it("shows clear configuration warning naming missing env vars when Supabase is unconfigured", async () => {
    configureSupabaseAuth({ url: null, anonKey: null });

    render(<App initialEntries={["/coach"]} />);

    expect(
      await screen.findByText(/VITE_SUPABASE_URL/),
    ).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_ANON_KEY/)).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /navegación principal/i })).not.toBeInTheDocument();
  });

  it("blocks unauthenticated users with clean email/password form and no manual JWT token field", async () => {
    render(<App initialEntries={["/coach"]} />);

    expect(
      await screen.findByText(/acceso privado por invitación/i),
    ).toBeInTheDocument();
    const emailInput = screen.getByLabelText(/correo electrónico/i);
    const passwordInput = screen.getByLabelText(/contraseña/i);
    expect(emailInput).toHaveAttribute("autocomplete", "email");
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");
    expect(screen.queryByLabelText(/token de sesión/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /navegación principal/i })).not.toBeInTheDocument();
  });

  it("signs in Athlete with email and password, sends Bearer token to API, and hides Curator actions", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    await user.type(await screen.findByLabelText(/correo electrónico/i), "atleta@fitness.test");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    const nav = await screen.findByRole("navigation", { name: /navegación principal/i });
    expect(nav).toHaveTextContent("Coach");
    expect(nav).toHaveTextContent("Entrenamiento");
    expect(nav).toHaveTextContent("Nutrición");
    expect(nav).toHaveTextContent("Ciencia");
    expect(nav).toHaveTextContent("Perfil Vivo");

    await user.click(screen.getByRole("link", { name: /ciencia/i }));
    expect(await screen.findByText(/base de conocimiento/i)).toBeInTheDocument();
    expect(screen.queryByText(/panel del curador/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/generar invitación/i)).not.toBeInTheDocument();
  });

  it("shows Spanish error message on invalid credentials and prevents double submission while loading", async () => {
    let loginCalls = 0;
    server.use(
      http.post(`${TEST_SUPABASE_URL}/auth/v1/token`, async () => {
        loginCalls += 1;
        await delay(80);
        return HttpResponse.json(
          {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            msg: "Invalid login credentials",
          },
          { status: 400 },
        );
      }),
    );

    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    await user.type(await screen.findByLabelText(/correo electrónico/i), "atleta@fitness.test");
    await user.type(screen.getByLabelText(/contraseña/i), "wrongpass");

    const submitBtn = screen.getByRole("button", { name: /iniciar sesión/i });
    await Promise.all([user.click(submitBtn), user.click(submitBtn)]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /correo electrónico o contraseña incorrectos/i,
    );
    expect(loginCalls).toBe(1);
    expect(screen.queryByRole("navigation", { name: /navegación principal/i })).not.toBeInTheDocument();
  });

  it("allows Dual-role Curator+Athlete to access personal tabs and issue invitations", async () => {
    seedSupabaseSession("tok-dual");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    expect(await screen.findByText(/panel del curador/i)).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/correo del atleta/i);
    await user.type(emailInput, "nuevo@fitness.test");
    await user.click(screen.getByRole("button", { name: /generar invitación/i }));

    expect(await screen.findByText("inv-token-generated-123")).toBeInTheDocument();

    const expectedLink = `${window.location.origin}/?invite=inv-token-generated-123`;
    expect(screen.getByText(expectedLink)).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /copiar enlace/i });
    await user.click(copyBtn);
    expect(await screen.findByText(/enlace copiado/i)).toBeInTheDocument();

    // Can navigate to personal Perfil Vivo without switching account
    await user.click(screen.getByRole("link", { name: /perfil vivo/i }));
    expect(await screen.findByRole("heading", { name: /perfil vivo/i })).toBeInTheDocument();
  });

  it("shows explicit cold-start indicator during slow wake-up and retries idempotent GET on 503", async () => {
    configureApiClient({ coldStartThresholdMs: 30, retryDelayMs: 20, maxGetRetries: 2 });
    seedSupabaseSession("tok-dual");

    let attempts = 0;
    server.use(
      http.get("*/api/v1/auth/me", async () => {
        attempts += 1;
        if (attempts === 1) {
          await delay(80);
          return HttpResponse.json({ detail: "Service waking up" }, { status: 503 });
        }
        return HttpResponse.json(DUAL_ROLE_USER);
      }),
    );

    render(<App initialEntries={["/coach"]} />);

    expect(await screen.findByRole("status")).toHaveTextContent(/activando servidor/i);
    expect(await screen.findByRole("navigation", { name: /navegación principal/i })).toBeInTheDocument();
    expect(attempts).toBe(2);
  });

  it("distinguishes hard network errors from cold-start waking indicator", async () => {
    configureApiClient({ coldStartThresholdMs: 30, retryDelayMs: 10, maxGetRetries: 1 });
    seedSupabaseSession("tok-dual");

    server.use(
      http.get("*/api/v1/auth/me", () => {
        return HttpResponse.error();
      }),
    );

    render(<App initialEntries={["/coach"]} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/error de conexión/i);
  });

  it("prevents duplicate POST submissions while a mutation is in flight", async () => {
    configureApiClient({ coldStartThresholdMs: 500, retryDelayMs: 10, maxGetRetries: 1 });
    seedSupabaseSession("tok-dual");

    let postCount = 0;
    server.use(
      http.post("*/api/v1/curator/invitations", async ({ request }) => {
        postCount += 1;
        await delay(120);
        const payload = (await request.json()) as { email: string; roles: ("athlete" | "curator")[] };
        return HttpResponse.json(
          {
            id: "44444444-4444-4444-4444-444444444444",
            email: payload.email,
            roles: payload.roles,
            status: "pending",
            expires_at: "2026-12-01T00:00:00Z",
            accepted_at: null,
            created_at: "2026-11-21T17:00:00Z",
            invitation_token: "inv-once-only",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    const emailInput = await screen.findByLabelText(/correo del atleta/i);
    await user.type(emailInput, "doble@fitness.test");

    const submitBtn = screen.getByRole("button", { name: /generar invitación/i });
    await Promise.all([user.click(submitBtn), user.click(submitBtn)]);

    await waitFor(() => {
      expect(screen.getByText("inv-once-only")).toBeInTheDocument();
    });
    expect(postCount).toBe(1);
  });

  it("persists session across app reloads and revokes local session on logout", async () => {
    let logoutCalled = false;
    server.use(
      http.post(`${TEST_SUPABASE_URL}/auth/v1/logout`, () => {
        logoutCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const user = userEvent.setup();
    const { unmount } = render(<App initialEntries={["/coach"]} />);

    await user.type(await screen.findByLabelText(/correo electrónico/i), "atleta@fitness.test");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByRole("navigation", { name: /navegación principal/i })).toBeInTheDocument();

    // Simulate closing and reopening the PWA
    unmount();
    render(<App initialEntries={["/coach"]} />);

    expect(await screen.findByRole("navigation", { name: /navegación principal/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/contraseña/i)).not.toBeInTheDocument();

    // Logout revokes Supabase session and returns to login screen
    await user.click(screen.getByRole("button", { name: /salir/i }));

    expect(await screen.findByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(logoutCalled).toBe(true);
    expect(window.localStorage.getItem(TEST_SUPABASE_STORAGE_KEY)).toBeNull();
  });

  it("clears authenticated state and shows explanatory Spanish message when session expires irrecoverably", async () => {
    // Seed an already-expired session and reject refresh via MSW
    const expiredSession = buildSupabaseSessionPayload({
      accessToken: "tok-athlete",
      expiresInSeconds: -60,
    });
    window.localStorage.setItem(TEST_SUPABASE_STORAGE_KEY, JSON.stringify(expiredSession));

    server.use(
      http.post(`${TEST_SUPABASE_URL}/auth/v1/token`, () => {
        return HttpResponse.json(
          {
            error: "invalid_grant",
            error_description: "Invalid Refresh Token: Refresh Token Not Found",
            msg: "Invalid Refresh Token: Refresh Token Not Found",
          },
          { status: 400 },
        );
      }),
    );

    render(<App initialEntries={["/coach"]} />);

    expect(await screen.findByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /tu sesión ha caducado o dejó de ser válida/i,
    );
    expect(screen.queryByRole("navigation", { name: /navegación principal/i })).not.toBeInTheDocument();
  });

  it("shows account activation screen on 401 with valid Supabase session, handles invalid code, and redeems invitation", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    await user.type(await screen.findByLabelText(/correo electrónico/i), "nuevo@fitness.test");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    // Enters needs_activation keeping Supabase session active
    expect(await screen.findByText(/nuevo@fitness\.test/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cerrar sesión/i })).toBeInTheDocument();

    // Invalid invitation code shows clear error
    const codeInput = screen.getByLabelText(/código de invitación/i);
    await user.type(codeInput, "inv-invalid");
    await user.click(screen.getByRole("button", { name: /activar cuenta con invitación/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/no existe, ya fue usada o ha caducado/i);

    // Valid invitation code + optional display name activates account and enters PWA
    await user.clear(codeInput);
    await user.type(codeInput, "inv-valid-999");
    await user.type(screen.getByLabelText(/nombre de atleta/i), "Alex Nuevo");
    await user.click(screen.getByRole("button", { name: /activar cuenta con invitación/i }));

    expect(await screen.findByRole("navigation", { name: /navegación principal/i })).toBeInTheDocument();
    expect(screen.getByText(/Alex Nuevo/i)).toBeInTheDocument();
  });

  it("captures ?invite= query param before login, pre-fills it on activation, and cleans it after redemption", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/?invite=inv-deep-456"]} />);

    await user.type(await screen.findByLabelText(/correo electrónico/i), "nuevo@fitness.test");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    const codeInput = (await screen.findByLabelText(/código de invitación/i)) as HTMLInputElement;
    expect(codeInput.value).toBe("inv-deep-456");

    await user.click(screen.getByRole("button", { name: /activar cuenta con invitación/i }));

    expect(await screen.findByRole("navigation", { name: /navegación principal/i })).toBeInTheDocument();
    expect(window.sessionStorage.getItem("fitness_coach_pending_invite")).toBeNull();
  });

  it("allows signing out from the activation screen to switch Supabase accounts", async () => {
    seedSupabaseSession("tok-pending", { email: "nuevo@fitness.test" });
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    expect(await screen.findByText(/nuevo@fitness\.test/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    expect(await screen.findByLabelText(/correo electrónico/i)).toBeInTheDocument();
    expect(window.localStorage.getItem(TEST_SUPABASE_STORAGE_KEY)).toBeNull();
  });

  it("allows initial Curator to bootstrap dual Curator+Athlete account from activation screen", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    await user.type(await screen.findByLabelText(/correo electrónico/i), "bootstrap@fitness.test");
    await user.type(screen.getByLabelText(/contraseña/i), "password123");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByText(/bootstrap@fitness\.test/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /activar curador inicial/i }));
    await user.type(screen.getByLabelText(/nombre de atleta/i), "Elena Curadora");
    await user.click(screen.getByRole("button", { name: /activar cuenta de curador/i }));

    expect(await screen.findByRole("navigation", { name: /navegación principal/i })).toBeInTheDocument();
    expect(screen.getByText(/Elena Curadora/i)).toBeInTheDocument();
    expect(screen.getByText(/^Curador$/i)).toBeInTheDocument();
  });

  it("shows clear backend error when initial Curator bootstrap is rejected", async () => {
    seedSupabaseSession("tok-pending", { email: "nuevo@fitness.test" });
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    expect(await screen.findByText(/nuevo@fitness\.test/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /activar curador inicial/i }));
    await user.click(screen.getByRole("button", { name: /activar cuenta de curador/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /no está autorizado para el arranque inicial de curador/i,
    );
    expect(screen.queryByRole("navigation", { name: /navegación principal/i })).not.toBeInTheDocument();
  });
});
