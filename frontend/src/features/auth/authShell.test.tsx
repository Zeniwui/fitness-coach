import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { App } from "../../app/App";
import { server } from "../../test/msw/server";
import { DUAL_ROLE_USER } from "../../test/msw/handlers/identity";
import { configureApiClient, setAuthToken } from "../../api/client";

describe("Auth, Roles, PWA Shell & Cold-Start Handling (#2)", () => {
  it("blocks unauthenticated users and shows invite-only access screen", async () => {
    render(<App initialEntries={["/coach"]} />);

    expect(
      await screen.findByText(/acceso privado por invitación/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: /navegación principal/i })).not.toBeInTheDocument();
  });

  it("shows 5-tab mobile nav to Athlete-only user and hides Curator actions", async () => {
    setAuthToken("tok-athlete");
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const nav = await screen.findByRole("navigation", { name: /navegación principal/i });
    expect(nav).toHaveTextContent("Coach");
    expect(nav).toHaveTextContent("Entreno");
    expect(nav).toHaveTextContent("Nutrición");
    expect(nav).toHaveTextContent("Ciencia");
    expect(nav).toHaveTextContent("Perfil Vivo");

    await user.click(screen.getByRole("link", { name: /ciencia/i }));
    expect(await screen.findByText(/base de conocimiento/i)).toBeInTheDocument();
    expect(screen.queryByText(/panel del curador/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/generar invitación/i)).not.toBeInTheDocument();
  });

  it("allows Dual-role Curator+Athlete to access personal tabs and issue invitations", async () => {
    setAuthToken("tok-dual");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    expect(await screen.findByText(/panel del curador/i)).toBeInTheDocument();

    const emailInput = screen.getByLabelText(/correo del atleta/i);
    await user.type(emailInput, "nuevo@fitness.test");
    await user.click(screen.getByRole("button", { name: /generar invitación/i }));

    expect(await screen.findByText(/inv-token-generated-123/i)).toBeInTheDocument();

    // Can navigate to personal Perfil Vivo without switching account
    await user.click(screen.getByRole("link", { name: /perfil vivo/i }));
    expect(await screen.findByRole("heading", { name: /perfil vivo/i })).toBeInTheDocument();
  });

  it("shows explicit cold-start indicator during slow wake-up and retries idempotent GET on 503", async () => {
    configureApiClient({ coldStartThresholdMs: 30, retryDelayMs: 20, maxGetRetries: 2 });
    setAuthToken("tok-dual");

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
    setAuthToken("tok-dual");

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
    setAuthToken("tok-dual");

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
      expect(screen.getByText(/inv-once-only/i)).toBeInTheDocument();
    });
    expect(postCount).toBe(1);
  });
});
