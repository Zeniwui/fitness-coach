import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

type MesocycleResponse = components["schemas"]["MesocycleResponse"];
type TrainingSessionResponse = components["schemas"]["TrainingSessionResponse"];
type TodaySessionResponse = components["schemas"]["TodaySessionResponse"];
type WeeklyVolumeSummaryResponse = components["schemas"]["WeeklyVolumeSummaryResponse"];
type CreateMesocycleRequest = components["schemas"]["CreateMesocycleRequest"];
type UpdateMesocycleRequest = components["schemas"]["UpdateMesocycleRequest"];
type ActivateMesocycleRequest = components["schemas"]["ActivateMesocycleRequest"];
type CreateTrainingSessionRequest = components["schemas"]["CreateTrainingSessionRequest"];
type UpdateTrainingSessionRequest = components["schemas"]["UpdateTrainingSessionRequest"];

const ACTIVE_MESO_ID = "70000000-0000-0000-0000-000000000001";
const PLANNED_TORSO_ID = "70000000-0000-0000-0000-000000000101";
const PLANNED_PIERNA_ID = "70000000-0000-0000-0000-000000000102";
const SEED_SESSION_ID = "70000000-0000-0000-0000-000000000201";

function createDefaultMesocycles(): MesocycleResponse[] {
  return [
    {
      id: ACTIVE_MESO_ID,
      name: "Mesociclo Hipertrofia Torso-Pierna",
      goal: "Hipertrofia muscular",
      duration_weeks: 5,
      status: "active",
      progression_criteria: "Doble progresión en 8-12 reps",
      deload_criteria: "Semana 5 o caída de rendimiento en ≥2 ejercicios",
      notes: "Enfoque en torso superior",
      planned_sessions: [
        {
          id: PLANNED_TORSO_ID,
          day_order: 1,
          name: "Torso A",
          exercises: [
            {
              exercise_name: "Press inclinado mancuernas",
              primary_muscle_group: "pecho",
              secondary_muscle_groups: ["hombros", "triceps"],
              target_sets: 3,
              rep_range_min: 8,
              rep_range_max: 10,
              target_rir: 1,
              target_rpe: null,
              notes: null,
            },
            {
              exercise_name: "Remo en polea baja",
              primary_muscle_group: "espalda",
              secondary_muscle_groups: ["biceps"],
              target_sets: 3,
              rep_range_min: 8,
              rep_range_max: 12,
              target_rir: 2,
              target_rpe: null,
              notes: null,
            },
          ],
        },
        {
          id: PLANNED_PIERNA_ID,
          day_order: 2,
          name: "Pierna A",
          exercises: [
            {
              exercise_name: "Prensa inclinada",
              primary_muscle_group: "cuadriceps",
              secondary_muscle_groups: ["gluteos"],
              target_sets: 4,
              rep_range_min: 10,
              rep_range_max: 12,
              target_rir: 2,
              target_rpe: null,
              notes: null,
            },
          ],
        },
      ],
      created_at: "2026-11-01T10:00:00Z",
      updated_at: "2026-11-01T10:00:00Z",
      activated_at: "2026-11-01T10:00:00Z",
      completed_at: null,
    },
  ];
}

function createDefaultSessions(): TrainingSessionResponse[] {
  return [
    {
      id: SEED_SESSION_ID,
      mesocycle_id: ACTIVE_MESO_ID,
      planned_session_id: PLANNED_TORSO_ID,
      session_date: "2026-11-18",
      name: "Torso A",
      origin: "manual_form",
      fatigue_notes: "Fatiga acumulada en hombro",
      sets: [
        {
          id: "70000000-0000-0000-0000-000000000301",
          exercise_name: "Press inclinado mancuernas",
          muscle_group: "pecho",
          secondary_muscle_groups: ["hombros", "triceps"],
          set_order: 1,
          reps: 9,
          load: 32,
          unit: "kg",
          rir: 1,
          rpe: null,
          notes: null,
        },
        {
          id: "70000000-0000-0000-0000-000000000302",
          exercise_name: "Press inclinado mancuernas",
          muscle_group: "pecho",
          secondary_muscle_groups: ["hombros", "triceps"],
          set_order: 2,
          reps: 8,
          load: 32,
          unit: "kg",
          rir: 1,
          rpe: null,
          notes: null,
        },
      ],
      created_at: "2026-11-18T18:00:00Z",
      updated_at: "2026-11-18T18:00:00Z",
    },
  ];
}

let mockMesocycles: MesocycleResponse[] = createDefaultMesocycles();
let mockSessions: TrainingSessionResponse[] = createDefaultSessions();
let idCounter = 10;

export function resetMockTrainingState(options?: {
  mesocycles?: MesocycleResponse[];
  sessions?: TrainingSessionResponse[];
}): void {
  mockMesocycles = options?.mesocycles
    ? structuredClone(options.mesocycles)
    : createDefaultMesocycles();
  mockSessions = options?.sessions ? structuredClone(options.sessions) : createDefaultSessions();
  idCounter = 10;
}

function nextUuid(prefix: string): string {
  const n = String(idCounter++).padStart(12, "0");
  return `${prefix}-0000-0000-0000-${n}`;
}

function buildTodayResponse(plannedSessionId?: string | null): TodaySessionResponse {
  const active =
    mockMesocycles.find((m) => m.status === "active" || m.status === "deload") ?? null;
  if (!active || active.planned_sessions.length === 0) {
    return {
      active_mesocycle: active,
      planned_session: null,
      exercises: [],
      completed_sessions_in_mesocycle: 0,
    };
  }
  const planned =
    (plannedSessionId
      ? active.planned_sessions.find((ps) => ps.id === plannedSessionId)
      : null) ?? active.planned_sessions[0];

  const exercises = planned.exercises.map((ex) => {
    const matchingSessions = mockSessions.filter((s) =>
      s.sets.some((st) => st.exercise_name.toLowerCase() === ex.exercise_name.toLowerCase()),
    );
    if (matchingSessions.length === 0) {
      return { planned: ex, previous_mark: null };
    }
    const latest = matchingSessions[0];
    const lastSets = latest.sets.filter(
      (st) => st.exercise_name.toLowerCase() === ex.exercise_name.toLowerCase(),
    );
    const best = lastSets.reduce((acc, s) => (s.load > acc.load ? s : acc), lastSets[0]);
    return {
      planned: ex,
      previous_mark: {
        exercise_name: ex.exercise_name,
        last_session_date: latest.session_date,
        last_sets: lastSets,
        best_load: best.load,
        best_reps: best.reps,
        best_unit: best.unit,
        best_rir: best.rir,
        best_e1rm_kg: Math.round(best.load * (1 + best.reps / 30) * 100) / 100,
      },
    };
  });

  return {
    active_mesocycle: active,
    planned_session: planned,
    exercises,
    completed_sessions_in_mesocycle: mockSessions.filter((s) => s.mesocycle_id === active.id)
      .length,
  };
}

function buildVolumeSummary(): WeeklyVolumeSummaryResponse {
  const active =
    mockMesocycles.find((m) => m.status === "active" || m.status === "deload") ?? null;
  const direct: Record<string, number> = {};
  const secondary: Record<string, number> = {};
  const effective: Record<string, number> = {};

  for (const s of mockSessions) {
    for (const st of s.sets) {
      if (st.rir !== null && st.rir !== undefined && st.rir > 4) continue;
      direct[st.muscle_group] = (direct[st.muscle_group] ?? 0) + 1;
      effective[st.muscle_group] = (effective[st.muscle_group] ?? 0) + 1;
      for (const sec of st.secondary_muscle_groups) {
        secondary[sec] = (secondary[sec] ?? 0) + 1;
        effective[sec] = (effective[sec] ?? 0) + 0.5;
      }
    }
  }

  const groups = Array.from(new Set([...Object.keys(direct), ...Object.keys(secondary)])).map(
    (mg) => ({
      muscle_group: mg,
      direct_sets: direct[mg] ?? 0,
      secondary_sets: secondary[mg] ?? 0,
      effective_sets: effective[mg] ?? 0,
      planned_sets: mg === "pecho" ? 6 : 4,
      average_rir: 1.0,
    }),
  );

  return {
    week_start: "2026-11-16",
    week_end: "2026-11-22",
    active_mesocycle_id: active?.id ?? null,
    active_mesocycle_name: active?.name ?? null,
    total_sessions: mockSessions.length,
    total_effective_sets: groups.reduce((sum, g) => sum + g.effective_sets, 0),
    by_muscle_group: groups,
    exercise_trends: [
      {
        exercise_name: "Press inclinado mancuernas",
        sessions_analyzed: 2,
        latest_e1rm_kg: 41.6,
        previous_e1rm_kg: 44.0,
        e1rm_delta_pct: -5.45,
        latest_avg_rir: 1.0,
        status: "regressing",
      },
    ],
    deload_assessment: {
      status: "recommended",
      recommended: true,
      reasons_es: [
        "Caída de rendimiento (e1RM) detectada en: Press inclinado mancuernas.",
        "Fatiga acumulada o proximidad extrema al fallo (RIR ≤ 0.8) en 2 sesiones recientes.",
      ],
      weeks_into_mesocycle: 4,
      high_fatigue_sessions: 2,
      regressing_exercises: ["Press inclinado mancuernas"],
    },
  };
}

export const trainingHandlers = [
  http.get("*/api/v1/training/mesocycles", () => {
    return HttpResponse.json(mockMesocycles);
  }),

  http.post("*/api/v1/training/mesocycles", async ({ request }) => {
    const body = (await request.json()) as CreateMesocycleRequest;
    const created: MesocycleResponse = {
      id: nextUuid("71000000"),
      name: body.name,
      goal: body.goal,
      duration_weeks: body.duration_weeks ?? 5,
      status: "draft",
      progression_criteria: body.progression_criteria ?? null,
      deload_criteria: body.deload_criteria ?? null,
      notes: body.notes ?? null,
      planned_sessions: body.planned_sessions.map((ps) => ({
        id: nextUuid("72000000"),
        day_order: ps.day_order,
        name: ps.name,
        exercises: ps.exercises.map((ex) => ({
          exercise_name: ex.exercise_name,
          primary_muscle_group: ex.primary_muscle_group,
          secondary_muscle_groups: ex.secondary_muscle_groups ?? [],
          target_sets: ex.target_sets ?? 3,
          rep_range_min: ex.rep_range_min ?? 8,
          rep_range_max: ex.rep_range_max ?? 12,
          target_rir: ex.target_rir ?? 2,
          target_rpe: ex.target_rpe ?? null,
          notes: ex.notes ?? null,
        })),
      })),
      created_at: "2026-11-21T19:00:00Z",
      updated_at: "2026-11-21T19:00:00Z",
      activated_at: null,
      completed_at: null,
    };
    mockMesocycles = [created, ...mockMesocycles];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post("*/api/v1/training/mesocycles/draft-with-coach", async () => {
    const created: MesocycleResponse = {
      id: nextUuid("71000000"),
      name: "Borrador Coach Hipertrofia",
      goal: "Hipertrofia muscular",
      duration_weeks: 5,
      status: "draft",
      progression_criteria: "Doble progresión en rango 8-12 reps",
      deload_criteria: "Semana 5 o fatiga persistente",
      notes: "Generado por el Coach según Perfil Vivo",
      planned_sessions: [
        {
          id: nextUuid("72000000"),
          day_order: 1,
          name: "Torso A (Coach)",
          exercises: [
            {
              exercise_name: "Press plano mancuernas",
              primary_muscle_group: "pecho",
              secondary_muscle_groups: ["triceps"],
              target_sets: 3,
              rep_range_min: 8,
              rep_range_max: 12,
              target_rir: 2,
              target_rpe: null,
              notes: null,
            },
          ],
        },
      ],
      created_at: "2026-11-21T19:05:00Z",
      updated_at: "2026-11-21T19:05:00Z",
      activated_at: null,
      completed_at: null,
    };
    mockMesocycles = [created, ...mockMesocycles];
    return HttpResponse.json(
      {
        mesocycle: created,
        cited_card_ids: [],
        coach_rationale_es: "Borrador personalizado generado según tu Perfil Vivo.",
      },
      { status: 201 },
    );
  }),

  http.patch("*/api/v1/training/mesocycles/:mesocycleId", async ({ params, request }) => {
    const body = (await request.json()) as UpdateMesocycleRequest;
    const idx = mockMesocycles.findIndex((m) => m.id === params.mesocycleId);
    if (idx === -1) {
      return HttpResponse.json({ detail: "No encontrado" }, { status: 404 });
    }
    const existing = mockMesocycles[idx];
    const updated: MesocycleResponse = {
      ...existing,
      name: body.name ?? existing.name,
      goal: body.goal ?? existing.goal,
      duration_weeks: body.duration_weeks ?? existing.duration_weeks,
      progression_criteria:
        body.progression_criteria !== undefined
          ? body.progression_criteria
          : existing.progression_criteria,
      deload_criteria:
        body.deload_criteria !== undefined ? body.deload_criteria : existing.deload_criteria,
      notes: body.notes !== undefined ? body.notes : existing.notes,
      planned_sessions: body.planned_sessions
        ? body.planned_sessions.map((ps) => ({
            id: nextUuid("72000000"),
            day_order: ps.day_order,
            name: ps.name,
            exercises: ps.exercises.map((ex) => ({
              exercise_name: ex.exercise_name,
              primary_muscle_group: ex.primary_muscle_group,
              secondary_muscle_groups: ex.secondary_muscle_groups ?? [],
              target_sets: ex.target_sets ?? 3,
              rep_range_min: ex.rep_range_min ?? 8,
              rep_range_max: ex.rep_range_max ?? 12,
              target_rir: ex.target_rir ?? 2,
              target_rpe: ex.target_rpe ?? null,
              notes: ex.notes ?? null,
            })),
          }))
        : existing.planned_sessions,
      updated_at: "2026-11-21T19:10:00Z",
    };
    mockMesocycles[idx] = updated;
    return HttpResponse.json(updated);
  }),

  http.post("*/api/v1/training/mesocycles/:mesocycleId/activate", async ({ params, request }) => {
    const body = (await request.json()) as ActivateMesocycleRequest;
    const target = mockMesocycles.find((m) => m.id === params.mesocycleId);
    if (!target) {
      return HttpResponse.json({ detail: "No encontrado" }, { status: 404 });
    }
    const current = mockMesocycles.find(
      (m) => (m.status === "active" || m.status === "deload") && m.id !== target.id,
    );
    if (current && !body.confirm_transition_status) {
      return HttpResponse.json(
        {
          detail: {
            message: `Ya tienes un Mesociclo activo ('${current.name}'). Confirma si deseas marcarlo como completado o archivado.`,
            active_mesocycle_id: current.id,
            active_mesocycle_name: current.name,
            active_mesocycle_status: current.status,
          },
        },
        { status: 409 },
      );
    }

    let previousTransitioned: MesocycleResponse | null = null;
    if (current && body.confirm_transition_status) {
      current.status = body.confirm_transition_status;
      current.completed_at = "2026-11-21T19:15:00Z";
      previousTransitioned = { ...current };
    }

    target.status = "active";
    target.activated_at = "2026-11-21T19:15:00Z";
    return HttpResponse.json({
      mesocycle: { ...target },
      previous_mesocycle: previousTransitioned,
    });
  }),

  http.post("*/api/v1/training/mesocycles/:mesocycleId/status", async ({ params, request }) => {
    const body = (await request.json()) as { status: string };
    const target = mockMesocycles.find((m) => m.id === params.mesocycleId);
    if (!target) {
      return HttpResponse.json({ detail: "No encontrado" }, { status: 404 });
    }
    target.status = body.status;
    return HttpResponse.json({ ...target });
  }),

  http.get("*/api/v1/training/today", ({ request }) => {
    const url = new URL(request.url);
    const plannedSessionId = url.searchParams.get("planned_session_id");
    return HttpResponse.json(buildTodayResponse(plannedSessionId));
  }),

  http.get("*/api/v1/training/sessions", () => {
    return HttpResponse.json(mockSessions);
  }),

  http.post("*/api/v1/training/sessions", async ({ request }) => {
    const body = (await request.json()) as CreateTrainingSessionRequest;
    const created: TrainingSessionResponse = {
      id: nextUuid("73000000"),
      mesocycle_id: body.mesocycle_id ?? ACTIVE_MESO_ID,
      planned_session_id: body.planned_session_id ?? null,
      session_date: body.session_date,
      name: body.name,
      origin: body.origin ?? "manual_form",
      fatigue_notes: body.fatigue_notes ?? null,
      sets: body.sets.map((s) => ({
        id: nextUuid("74000000"),
        exercise_name: s.exercise_name,
        muscle_group: s.muscle_group,
        secondary_muscle_groups: s.secondary_muscle_groups ?? [],
        set_order: s.set_order,
        reps: s.reps,
        load: s.load,
        unit: s.unit ?? "kg",
        rir: s.rir ?? null,
        rpe: s.rpe ?? null,
        notes: s.notes ?? null,
      })),
      created_at: "2026-11-21T19:20:00Z",
      updated_at: "2026-11-21T19:20:00Z",
    };
    mockSessions = [created, ...mockSessions];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.put("*/api/v1/training/sessions/:sessionId", async ({ params, request }) => {
    const body = (await request.json()) as UpdateTrainingSessionRequest;
    const idx = mockSessions.findIndex((s) => s.id === params.sessionId);
    if (idx === -1) {
      return HttpResponse.json({ detail: "No encontrada" }, { status: 404 });
    }
    const updated: TrainingSessionResponse = {
      ...mockSessions[idx],
      session_date: body.session_date,
      name: body.name,
      fatigue_notes: body.fatigue_notes ?? null,
      sets: body.sets.map((s) => ({
        id: nextUuid("74000000"),
        exercise_name: s.exercise_name,
        muscle_group: s.muscle_group,
        secondary_muscle_groups: s.secondary_muscle_groups ?? [],
        set_order: s.set_order,
        reps: s.reps,
        load: s.load,
        unit: s.unit ?? "kg",
        rir: s.rir ?? null,
        rpe: s.rpe ?? null,
        notes: s.notes ?? null,
      })),
      updated_at: "2026-11-21T19:25:00Z",
    };
    mockSessions[idx] = updated;
    return HttpResponse.json(updated);
  }),

  http.delete("*/api/v1/training/sessions/:sessionId", ({ params }) => {
    mockSessions = mockSessions.filter((s) => s.id !== params.sessionId);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/api/v1/training/volume-summary", () => {
    return HttpResponse.json(buildVolumeSummary());
  }),
];
