import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

type LivingProfileResponse = components["schemas"]["LivingProfileResponse"];
type UpsertLivingProfileRequest = components["schemas"]["UpsertLivingProfileRequest"];
type InjuryResponse = components["schemas"]["InjuryResponse"];
type CreateInjuryRequest = components["schemas"]["CreateInjuryRequest"];
type UpdateInjuryRequest = components["schemas"]["UpdateInjuryRequest"];

function createDefaultProfile(): LivingProfileResponse {
  return {
    athlete_id: "11111111-1111-1111-1111-111111111111",
    has_saved_profile: false,
    age: null,
    sex: null,
    height_cm: null,
    base_weight_kg: null,
    experience_level: null,
    primary_goal: null,
    training_days_per_week: null,
    session_duration_min: null,
    equipment: [],
    allergies: [],
    food_preferences: [],
    training_approach: "natural",
    notes: null,
    updated_at: null,
    injuries: [],
    active_injuries_count: 0,
  };
}

let mockProfileState: LivingProfileResponse = createDefaultProfile();
let injuryCounter = 1;

export function resetMockProfileState(override?: Partial<LivingProfileResponse>): void {
  injuryCounter = 1;
  mockProfileState = {
    ...createDefaultProfile(),
    ...override,
  };
  mockProfileState.active_injuries_count = mockProfileState.injuries.filter(
    (item) => item.status === "active",
  ).length;
}

function recalcActiveCount(): void {
  mockProfileState.active_injuries_count = mockProfileState.injuries.filter(
    (item) => item.status === "active",
  ).length;
}

export const profileHandlers = [
  http.get("*/api/v1/profile", ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        { detail: "Se requiere iniciar sesión para acceder a este recurso." },
        { status: 401 },
      );
    }
    return HttpResponse.json(mockProfileState);
  }),

  http.put("*/api/v1/profile", async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        { detail: "Se requiere iniciar sesión para acceder a este recurso." },
        { status: 401 },
      );
    }
    const payload = (await request.json()) as UpsertLivingProfileRequest;
    mockProfileState = {
      ...mockProfileState,
      has_saved_profile: true,
      age: payload.age ?? null,
      sex: payload.sex ?? null,
      height_cm: payload.height_cm ?? null,
      base_weight_kg: payload.base_weight_kg ?? null,
      experience_level: payload.experience_level ?? null,
      primary_goal: payload.primary_goal ?? null,
      training_days_per_week: payload.training_days_per_week ?? null,
      session_duration_min: payload.session_duration_min ?? null,
      equipment: payload.equipment ?? [],
      allergies: payload.allergies ?? [],
      food_preferences: payload.food_preferences ?? [],
      training_approach: payload.training_approach ?? "natural",
      notes: payload.notes ?? null,
      updated_at: "2026-11-21T18:30:00Z",
    };
    recalcActiveCount();
    return HttpResponse.json(mockProfileState);
  }),

  http.get("*/api/v1/profile/injuries", ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        { detail: "Se requiere iniciar sesión para acceder a este recurso." },
        { status: 401 },
      );
    }
    return HttpResponse.json({ items: mockProfileState.injuries });
  }),

  http.post("*/api/v1/profile/injuries", async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        { detail: "Se requiere iniciar sesión para acceder a este recurso." },
        { status: 401 },
      );
    }
    const payload = (await request.json()) as CreateInjuryRequest;
    const created: InjuryResponse = {
      id: `00000000-0000-0000-0000-00000000000${injuryCounter++}`,
      body_part: payload.body_part,
      description: payload.description,
      severity: payload.severity ?? "moderate",
      status: "active",
      resolution_notes: null,
      created_at: "2026-11-21T18:30:00Z",
      resolved_at: null,
    };
    mockProfileState.injuries = [created, ...mockProfileState.injuries];
    recalcActiveCount();
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch("*/api/v1/profile/injuries/:injuryId", async ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        { detail: "Se requiere iniciar sesión para acceder a este recurso." },
        { status: 401 },
      );
    }
    const payload = (await request.json()) as UpdateInjuryRequest;
    const injuryId = String(params.injuryId);
    const idx = mockProfileState.injuries.findIndex((item) => item.id === injuryId);
    if (idx === -1) {
      return HttpResponse.json(
        { detail: "La lesión o restricción indicada no existe." },
        { status: 404 },
      );
    }
    const current = mockProfileState.injuries[idx];
    const nextStatus = payload.status ?? current.status;
    const updated: InjuryResponse = {
      ...current,
      body_part: payload.body_part ?? current.body_part,
      description: payload.description ?? current.description,
      severity: payload.severity ?? current.severity,
      status: nextStatus,
      resolved_at:
        nextStatus === "resolved"
          ? (payload.resolved_at ?? current.resolved_at ?? "2026-11-21T19:00:00Z")
          : null,
      resolution_notes:
        nextStatus === "resolved"
          ? (payload.resolution_notes ?? current.resolution_notes)
          : null,
    };
    mockProfileState.injuries[idx] = updated;
    recalcActiveCount();
    return HttpResponse.json(updated);
  }),

  http.delete("*/api/v1/profile/injuries/:injuryId", ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json(
        { detail: "Se requiere iniciar sesión para acceder a este recurso." },
        { status: 401 },
      );
    }
    const injuryId = String(params.injuryId);
    const before = mockProfileState.injuries.length;
    mockProfileState.injuries = mockProfileState.injuries.filter((item) => item.id !== injuryId);
    if (mockProfileState.injuries.length === before) {
      return HttpResponse.json(
        { detail: "La lesión o restricción indicada no existe." },
        { status: 404 },
      );
    }
    recalcActiveCount();
    return new HttpResponse(null, { status: 204 });
  }),
];
