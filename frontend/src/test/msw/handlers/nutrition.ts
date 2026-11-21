import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

type NutritionPhaseResponse = components["schemas"]["NutritionPhaseResponse"];
type CreateNutritionPhaseRequest = components["schemas"]["CreateNutritionPhaseRequest"];
type UpdateNutritionPhaseRequest = components["schemas"]["UpdateNutritionPhaseRequest"];
type CompleteNutritionPhaseRequest = components["schemas"]["CompleteNutritionPhaseRequest"];
type WeeklyCheckInResponse = components["schemas"]["WeeklyCheckInResponse"];
type CreateWeeklyCheckInRequest = components["schemas"]["CreateWeeklyCheckInRequest"];

let phases: NutritionPhaseResponse[] = [];
let checkins: WeeklyCheckInResponse[] = [];
let phaseCounter = 1;
let checkinCounter = 1;

export function resetMockNutritionState(options?: {
  phases?: NutritionPhaseResponse[];
  checkins?: WeeklyCheckInResponse[];
}): void {
  phaseCounter = 1;
  checkinCounter = 1;
  phases = options?.phases ? structuredClone(options.phases) : [];
  checkins = options?.checkins ? structuredClone(options.checkins) : [];
}

function getActivePhase(): NutritionPhaseResponse | undefined {
  return phases.find((p) => p.status === "active");
}

function sortPhases(list: NutritionPhaseResponse[]): NutritionPhaseResponse[] {
  return [...list].sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    return b.start_date.localeCompare(a.start_date);
  });
}

export const nutritionHandlers = [
  http.get("*/api/v1/nutrition/phases", ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    return HttpResponse.json(sortPhases(phases));
  }),

  http.post("*/api/v1/nutrition/phases", async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    const body = (await request.json()) as CreateNutritionPhaseRequest;
    const startDate = body.start_date ?? "2026-11-21";

    // Single-active invariant: close prior active phase cleanly
    phases = phases.map((p) =>
      p.status === "active"
        ? { ...p, status: "completed", end_date: startDate, updated_at: "2026-11-21T19:00:00Z" }
        : p,
    );

    const created: NutritionPhaseResponse = {
      id: `20000000-0000-0000-0000-00000000000${phaseCounter++}`,
      athlete_id: "11111111-1111-1111-1111-111111111111",
      phase_type: body.phase_type,
      status: "active",
      start_date: startDate,
      end_date: null,
      target_calories: body.target_calories,
      protein_g: body.protein_g,
      fat_g: body.fat_g,
      carbs_g: body.carbs_g,
      target_weekly_weight_change_kg: body.target_weekly_weight_change_kg,
      notes: body.notes ?? null,
      created_at: "2026-11-21T19:00:00Z",
      updated_at: "2026-11-21T19:00:00Z",
    };
    phases = [created, ...phases];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.patch("*/api/v1/nutrition/phases/:phaseId", async ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    const { phaseId } = params;
    const existing = phases.find((p) => p.id === phaseId);
    if (!existing) {
      return HttpResponse.json(
        { detail: "No se encontró la Fase Nutricional solicitada." },
        { status: 404 },
      );
    }
    if (existing.status !== "active") {
      return HttpResponse.json(
        { detail: "No se puede modificar una Fase Nutricional ya finalizada." },
        { status: 409 },
      );
    }
    const body = (await request.json()) as UpdateNutritionPhaseRequest;
    const updated: NutritionPhaseResponse = {
      ...existing,
      phase_type: body.phase_type ?? existing.phase_type,
      target_calories: body.target_calories ?? existing.target_calories,
      protein_g: body.protein_g ?? existing.protein_g,
      fat_g: body.fat_g ?? existing.fat_g,
      carbs_g: body.carbs_g ?? existing.carbs_g,
      target_weekly_weight_change_kg:
        body.target_weekly_weight_change_kg ?? existing.target_weekly_weight_change_kg,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      updated_at: "2026-11-21T19:05:00Z",
    };
    phases = phases.map((p) => (p.id === phaseId ? updated : p));
    return HttpResponse.json(updated);
  }),

  http.post("*/api/v1/nutrition/phases/:phaseId/complete", async ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    const { phaseId } = params;
    const existing = phases.find((p) => p.id === phaseId);
    if (!existing) {
      return HttpResponse.json(
        { detail: "No se encontró la Fase Nutricional solicitada." },
        { status: 404 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as CompleteNutritionPhaseRequest;
    const completed: NutritionPhaseResponse = {
      ...existing,
      status: "completed",
      end_date: body.end_date ?? "2026-11-21",
      updated_at: "2026-11-21T19:10:00Z",
    };
    phases = phases.map((p) => (p.id === phaseId ? completed : p));
    return HttpResponse.json(completed);
  }),

  http.get("*/api/v1/nutrition/checkins", ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    return HttpResponse.json(checkins);
  }),

  http.post("*/api/v1/nutrition/checkins", async ({ request }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    const body = (await request.json()) as CreateWeeklyCheckInRequest;

    const duplicate = checkins.find((c) => c.idempotency_key === body.idempotency_key);
    if (duplicate) {
      return HttpResponse.json(duplicate, { status: 200 });
    }

    const activePhase = getActivePhase();
    const avgWeight =
      body.daily_weights && body.daily_weights.length > 0
        ? Number(
            (
              body.daily_weights.reduce((acc, w) => acc + w, 0) / body.daily_weights.length
            ).toFixed(2),
          )
        : (body.average_weight_kg ?? 80.0);

    const prior = checkins[0];
    const actualWeekly = prior ? Number((avgWeight - prior.average_weight_kg).toFixed(2)) : null;
    const targetWeekly = activePhase?.target_weekly_weight_change_kg ?? null;
    const deviation =
      actualWeekly !== null && targetWeekly !== null
        ? Number((actualWeekly - targetWeekly).toFixed(2))
        : null;
    const tdeeDelta = deviation !== null ? Math.round(-deviation * 1100) : null;

    let trendStatus = "insufficient_data";
    let calorieDelta = 0;
    let adjustmentStatus: WeeklyCheckInResponse["adjustment_status"] = "none";

    if (deviation !== null && targetWeekly !== null && activePhase) {
      if (Math.abs(deviation) <= 0.12) {
        trendStatus = "on_track";
      } else if (targetWeekly < 0) {
        trendStatus = deviation > 0 ? "losing_too_slow" : "losing_too_fast";
        calorieDelta = deviation > 0 ? -175 : 175;
        adjustmentStatus = "proposed";
      } else {
        trendStatus = deviation > 0 ? "gaining_too_fast" : "gaining_too_slow";
        calorieDelta = deviation > 0 ? -150 : 150;
        adjustmentStatus = "proposed";
      }
    }

    const proposedCalories = activePhase ? activePhase.target_calories + calorieDelta : null;
    const proposedCarbs = activePhase
      ? Math.max(50, activePhase.carbs_g + Math.round(calorieDelta / 4))
      : null;

    const trainingAdjustment =
      body.perceived_fatigue >= 8
        ? "Fatiga elevada: reduce un 20-30 % el volumen semanal o programa una descarga."
        : null;

    const created: WeeklyCheckInResponse = {
      id: `30000000-0000-0000-0000-00000000000${checkinCounter++}`,
      athlete_id: "11111111-1111-1111-1111-111111111111",
      nutrition_phase_id: activePhase?.id ?? null,
      checkin_date: body.checkin_date ?? "2026-11-21",
      idempotency_key: body.idempotency_key,
      average_weight_kg: avgWeight,
      daily_weights: body.daily_weights ?? [],
      body_measurements: body.body_measurements ?? {},
      adherence_score: body.adherence_score,
      sleep_quality: body.sleep_quality,
      energy_level: body.energy_level,
      hunger_level: body.hunger_level ?? null,
      recovery_score: body.recovery_score ?? null,
      perceived_fatigue: body.perceived_fatigue,
      performance_notes: body.performance_notes ?? null,
      estimated_tdee_delta_kcal: tdeeDelta,
      weight_trend: {
        current_weight_kg: avgWeight,
        previous_weight_kg: prior?.average_weight_kg ?? null,
        actual_weekly_change_kg: actualWeekly,
        target_weekly_change_kg: targetWeekly,
        weekly_deviation_kg: deviation,
        estimated_tdee_delta_kcal: tdeeDelta,
        trend_status: trendStatus,
      },
      coach_recommendations: {
        summary_es:
          adjustmentStatus === "proposed"
            ? `Tendencia (${actualWeekly} kg/sem) desviada frente al objetivo (${targetWeekly} kg/sem). Propongo ajustar ${calorieDelta > 0 ? `+${calorieDelta}` : calorieDelta} kcal/día.`
            : "Check-in registrado. Mantén tus objetivos actuales esta semana.",
        rationale_es:
          adjustmentStatus === "proposed"
            ? `Ajuste conservador manteniendo proteína en ${activePhase?.protein_g} g.`
            : "Sin ajuste calórico necesario por ahora.",
        calorie_delta_kcal: calorieDelta,
        proposed_target_calories: proposedCalories,
        proposed_protein_g: activePhase?.protein_g ?? null,
        proposed_fat_g: activePhase?.fat_g ?? null,
        proposed_carbs_g: proposedCarbs,
        training_adjustment_es: trainingAdjustment,
        cited_card_ids: [],
        respects_profile_notes: null,
      },
      adjustment_status: adjustmentStatus,
      adjustment_resolved_at: null,
      created_at: "2026-11-21T19:15:00Z",
    };

    checkins = [created, ...checkins];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post("*/api/v1/nutrition/checkins/:checkinId/apply-adjustment", ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    const { checkinId } = params;
    const existing = checkins.find((c) => c.id === checkinId);
    const activePhase = getActivePhase();
    if (!existing || !activePhase) {
      return HttpResponse.json({ detail: "No encontrado" }, { status: 404 });
    }

    const updatedPhase: NutritionPhaseResponse = {
      ...activePhase,
      target_calories:
        existing.coach_recommendations.proposed_target_calories ?? activePhase.target_calories,
      protein_g: existing.coach_recommendations.proposed_protein_g ?? activePhase.protein_g,
      fat_g: existing.coach_recommendations.proposed_fat_g ?? activePhase.fat_g,
      carbs_g: existing.coach_recommendations.proposed_carbs_g ?? activePhase.carbs_g,
      updated_at: "2026-11-21T19:20:00Z",
    };
    phases = phases.map((p) => (p.id === activePhase.id ? updatedPhase : p));

    const updatedCheckin: WeeklyCheckInResponse = {
      ...existing,
      adjustment_status: "accepted",
      adjustment_resolved_at: "2026-11-21T19:20:00Z",
    };
    checkins = checkins.map((c) => (c.id === checkinId ? updatedCheckin : c));

    return HttpResponse.json({ checkin: updatedCheckin, phase: updatedPhase });
  }),

  http.post("*/api/v1/nutrition/checkins/:checkinId/dismiss-adjustment", ({ request, params }) => {
    if (!request.headers.get("authorization")) {
      return HttpResponse.json({ detail: "No autorizado" }, { status: 401 });
    }
    const { checkinId } = params;
    const existing = checkins.find((c) => c.id === checkinId);
    if (!existing) {
      return HttpResponse.json({ detail: "No encontrado" }, { status: 404 });
    }
    const updatedCheckin: WeeklyCheckInResponse = {
      ...existing,
      adjustment_status: "dismissed",
      adjustment_resolved_at: "2026-11-21T19:20:00Z",
    };
    checkins = checkins.map((c) => (c.id === checkinId ? updatedCheckin : c));
    return HttpResponse.json(updatedCheckin);
  }),
];
