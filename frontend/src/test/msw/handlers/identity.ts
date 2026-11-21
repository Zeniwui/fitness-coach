import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

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

export const identityHandlers = [
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
    const payload = (await request.json()) as { email: string; roles: ("athlete" | "curator")[] };
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
