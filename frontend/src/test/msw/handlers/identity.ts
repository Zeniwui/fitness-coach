import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";
import { buildSupabaseSessionPayload, TEST_SUPABASE_URL } from "../../authHelpers";

type AuthMeResponse = components["schemas"]["AuthMeResponse"];
type InvitationListResponse = components["schemas"]["InvitationListResponse"];
type CreateInvitationResponse = components["schemas"]["CreateInvitationResponse"];

export const ATHLETE_ONLY_USER: AuthMeResponse = {
  athlete_id: "11111111-1111-1111-1111-111111111111",
  email: "atleta@fitness.test",
  display_name: "Atleta Solo",
  roles: ["athlete"],
  is_curator: false,
  is_athlete: true,
};

export const DUAL_ROLE_USER: AuthMeResponse = {
  athlete_id: "22222222-2222-2222-2222-222222222222",
  email: "curador@fitness.test",
  display_name: "Curador Atleta",
  roles: ["athlete", "curator"],
  is_curator: true,
  is_athlete: true,
};

const TEST_ACCOUNTS: Record<string, { password: string; accessToken: string }> = {
  "atleta@fitness.test": { password: "password123", accessToken: "tok-athlete" },
  "curador@fitness.test": { password: "password123", accessToken: "tok-dual" },
  "nuevo@fitness.test": { password: "password123", accessToken: "tok-pending" },
  "bootstrap@fitness.test": { password: "password123", accessToken: "tok-bootstrap" },
};

export const identityHandlers = [
  http.post(`${TEST_SUPABASE_URL}/auth/v1/token`, async ({ request }) => {
    const url = new URL(request.url);
    const grantType = url.searchParams.get("grant_type");

    if (grantType === "password") {
      const body = (await request.json()) as { email?: string; password?: string };
      const email = body.email?.trim().toLowerCase() ?? "";
      const account = TEST_ACCOUNTS[email];
      if (!account || account.password !== body.password) {
        return HttpResponse.json(
          {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            msg: "Invalid login credentials",
          },
          { status: 400 },
        );
      }
      return HttpResponse.json(
        buildSupabaseSessionPayload({
          accessToken: account.accessToken,
          email,
        }),
      );
    }

    if (grantType === "refresh_token") {
      const body = (await request.json()) as { refresh_token?: string };
      const token = body.refresh_token?.replace(/^refresh-/, "") || "tok-athlete";
      return HttpResponse.json(
        buildSupabaseSessionPayload({
          accessToken: token,
        }),
      );
    }

    return HttpResponse.json({ msg: "Unsupported grant type" }, { status: 400 });
  }),

  http.post(`${TEST_SUPABASE_URL}/auth/v1/logout`, () => {
    return new HttpResponse(null, { status: 204 });
  }),

  http.get(`${TEST_SUPABASE_URL}/auth/v1/user`, ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return HttpResponse.json({ msg: "Unauthorized" }, { status: 401 });
    }
    const token = auth.slice("Bearer ".length);
    return HttpResponse.json(
      buildSupabaseSessionPayload({ accessToken: token }).user,
    );
  }),

  http.get("*/api/v1/health", () => {
    return HttpResponse.json({ status: "ok", service: "fitness-coach-api" });
  }),

  http.get("*/api/v1/auth/me", ({ request }) => {
    const auth = request.headers.get("authorization");
    if (auth === "Bearer tok-athlete") {
      return HttpResponse.json(ATHLETE_ONLY_USER);
    }
    if (auth === "Bearer tok-dual") {
      return HttpResponse.json(DUAL_ROLE_USER);
    }
    return HttpResponse.json(
      { detail: "Se requiere iniciar sesión para acceder a este recurso." },
      { status: 401 },
    );
  }),

  http.post("*/api/v1/auth/invitations/redeem", async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (!auth?.startsWith("Bearer ")) {
      return HttpResponse.json(
        { detail: "Token de identidad no válido." },
        { status: 401 },
      );
    }
    const payload = (await request.json()) as {
      token: string;
      display_name?: string | null;
    };
    if (payload.token === "inv-invalid") {
      return HttpResponse.json(
        { detail: "La invitación no existe, ya fue usada o ha caducado." },
        { status: 400 },
      );
    }
    const redeemed: AuthMeResponse = {
      athlete_id: "99999999-9999-9999-9999-999999999999",
      email: "nuevo@fitness.test",
      display_name: payload.display_name?.trim() || "Nuevo Atleta",
      roles: ["athlete"],
      is_curator: false,
      is_athlete: true,
    };
    return HttpResponse.json(redeemed, { status: 201 });
  }),

  http.post("*/api/v1/auth/bootstrap-curator", async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (auth !== "Bearer tok-bootstrap") {
      return HttpResponse.json(
        { detail: "Tu correo no está autorizado para el arranque inicial de Curador." },
        { status: 403 },
      );
    }
    const payload = (await request.json()) as { display_name?: string | null };
    const bootstrapped: AuthMeResponse = {
      athlete_id: "22222222-2222-2222-2222-222222222222",
      email: "bootstrap@fitness.test",
      display_name: payload.display_name?.trim() || "Curador Inicial",
      roles: ["athlete", "curator"],
      is_curator: true,
      is_athlete: true,
    };
    return HttpResponse.json(bootstrapped, { status: 201 });
  }),

  http.get("*/api/v1/curator/invitations", ({ request }) => {
    const auth = request.headers.get("authorization");
    if (auth !== "Bearer tok-dual") {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    const body: InvitationListResponse = { items: [] };
    return HttpResponse.json(body);
  }),

  http.post("*/api/v1/curator/invitations", async ({ request }) => {
    const auth = request.headers.get("authorization");
    if (auth !== "Bearer tok-dual") {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    const payload = (await request.json()) as {
      email: string;
      roles: ("athlete" | "curator")[];
    };
    const created: CreateInvitationResponse = {
      id: "33333333-3333-3333-3333-333333333333",
      email: payload.email,
      roles: payload.roles,
      status: "pending",
      expires_at: "2026-12-01T00:00:00Z",
      accepted_at: null,
      created_at: "2026-11-21T17:00:00Z",
      invitation_token: "inv-token-generated-123",
    };
    return HttpResponse.json(created, { status: 201 });
  }),
];
