import { describe, expect, it } from "vitest";
import type { TrainingSessionResponse } from "./types";
import {
  aggregateExerciseProgression,
  aggregateWeeklyEffectiveVolume,
  getIsoWeekStart,
  selectWeeklyVolumeSeries,
} from "./volumeProgression";

function makeSession(
  id: string,
  sessionDate: string,
  sets: Array<{
    exercise_name: string;
    muscle_group: string;
    secondary_muscle_groups?: string[];
    reps: number;
    load: number;
    unit?: "kg" | "lb";
    rir?: number | null;
    rpe?: number | null;
  }>,
  name = "Sesión",
): TrainingSessionResponse {
  return {
    id,
    mesocycle_id: null,
    planned_session_id: null,
    session_date: sessionDate,
    name,
    origin: "manual_form",
    fatigue_notes: null,
    sets: sets.map((s, idx) => ({
      id: `${id}-set-${idx + 1}`,
      exercise_name: s.exercise_name,
      muscle_group: s.muscle_group,
      secondary_muscle_groups: s.secondary_muscle_groups ?? [],
      set_order: idx + 1,
      reps: s.reps,
      load: s.load,
      unit: s.unit ?? "kg",
      rir: s.rir === undefined ? 2 : s.rir,
      rpe: s.rpe ?? null,
      notes: null,
    })),
    created_at: `${sessionDate}T18:00:00Z`,
    updated_at: `${sessionDate}T18:00:00Z`,
  };
}

describe("volumeProgression pure training aggregation helpers", () => {
  it("resolves Monday-based ISO week start dates accurately", () => {
    expect(getIsoWeekStart("2026-11-16")).toBe("2026-11-16"); // Monday
    expect(getIsoWeekStart("2026-11-18")).toBe("2026-11-16"); // Wednesday
    expect(getIsoWeekStart("2026-11-22")).toBe("2026-11-16"); // Sunday
    expect(getIsoWeekStart("2026-01-01")).toBe("2025-12-29"); // Thursday across year boundary
  });

  it("aggregates multi-week effective volume with direct = 1.0, secondary = 0.5, and filters by muscle group", () => {
    expect(aggregateWeeklyEffectiveVolume([])).toEqual({
      muscleGroups: [],
      weeks: [],
    });

    // Provided out of chronological order (newest first, as API returns)
    const sessions: TrainingSessionResponse[] = [
      makeSession("s-w2", "2026-11-18", [
        // Effective: pecho +1, hombros +0.5, triceps +0.5
        {
          exercise_name: "Press inclinado",
          muscle_group: "Pecho",
          secondary_muscle_groups: ["hombros", "triceps", "pecho", "hombros"],
          reps: 9,
          load: 32,
          rir: 1,
        },
        // Ineffective warmup (rir = 5) -> must be excluded
        {
          exercise_name: "Press inclinado",
          muscle_group: "pecho",
          secondary_muscle_groups: ["triceps"],
          reps: 12,
          load: 20,
          rir: 5,
        },
        // Ineffective RPE = 5 -> excluded
        {
          exercise_name: "Remo polea",
          muscle_group: "espalda",
          secondary_muscle_groups: ["biceps"],
          reps: 10,
          load: 50,
          rir: null,
          rpe: 5,
        },
      ]),
      makeSession("s-w1-a", "2026-11-10", [
        // Effective: pecho +1, triceps +0.5
        {
          exercise_name: "Press inclinado",
          muscle_group: "pecho",
          secondary_muscle_groups: ["triceps"],
          reps: 8,
          load: 30,
          rir: 2,
        },
        // Effective: espalda +1, biceps +0.5
        {
          exercise_name: "Remo polea",
          muscle_group: "espalda",
          secondary_muscle_groups: ["bíceps"],
          reps: 10,
          load: 60,
          rir: null,
          rpe: 8,
        },
      ]),
      makeSession("s-w1-b", "2026-11-13", [
        // Same week (2026-11-09): pecho +1
        {
          exercise_name: "Aperturas",
          muscle_group: "pecho",
          reps: 12,
          load: 14,
          rir: 1,
        },
      ]),
    ];

    const result = aggregateWeeklyEffectiveVolume(sessions);

    expect(result.muscleGroups).toEqual(["biceps", "espalda", "hombros", "pecho", "triceps"]);
    expect(result.weeks).toHaveLength(2);

    // Week 1 (2026-11-09): pecho 2.0, triceps 0.5, espalda 1.0, biceps 0.5 -> total 4.0
    expect(result.weeks[0]).toEqual({
      weekStart: "2026-11-09",
      sessionCount: 2,
      totalEffectiveSets: 4,
      byMuscleGroup: {
        pecho: 2,
        triceps: 0.5,
        espalda: 1,
        biceps: 0.5,
      },
    });

    // Week 2 (2026-11-16): pecho 1.0, hombros 0.5, triceps 0.5 -> total 2.0
    expect(result.weeks[1]).toEqual({
      weekStart: "2026-11-16",
      sessionCount: 1,
      totalEffectiveSets: 2,
      byMuscleGroup: {
        pecho: 1,
        hombros: 0.5,
        triceps: 0.5,
      },
    });

    expect(selectWeeklyVolumeSeries(result, "all")).toEqual([
      { weekStart: "2026-11-09", effectiveSets: 4, sessionCount: 2 },
      { weekStart: "2026-11-16", effectiveSets: 2, sessionCount: 1 },
    ]);
    expect(selectWeeklyVolumeSeries(result, "pecho")).toEqual([
      { weekStart: "2026-11-09", effectiveSets: 2, sessionCount: 2 },
      { weekStart: "2026-11-16", effectiveSets: 1, sessionCount: 1 },
    ]);
    expect(selectWeeklyVolumeSeries(result, "espalda")).toEqual([
      { weekStart: "2026-11-09", effectiveSets: 1, sessionCount: 2 },
      { weekStart: "2026-11-16", effectiveSets: 0, sessionCount: 1 },
    ]);
  });

  it("aggregates e1RM and best-load progression across kg/lb for exercises with at least 2 sessions", () => {
    const sessions: TrainingSessionResponse[] = [
      // Newest first
      makeSession("s3", "2026-11-20", [
        {
          exercise_name: "Press inclinado mancuernas",
          muscle_group: "pecho",
          reps: 9,
          load: 34,
          unit: "kg",
        },
        // Mixed unit in lb for Sentadilla búlgara: 220 lb = 99.79 kg; e1RM (5 reps) = 116.42 kg
        {
          exercise_name: "sentadilla bulgara",
          muscle_group: "cuadriceps",
          reps: 5,
          load: 220,
          unit: "lb",
        },
        // Only 1 session -> must be excluded from progression chart
        {
          exercise_name: "Curl martillo",
          muscle_group: "biceps",
          reps: 10,
          load: 16,
          unit: "kg",
        },
        // Bodyweight (load = 0) across multiple sessions -> excluded from load/e1RM series
        {
          exercise_name: "Dominadas",
          muscle_group: "espalda",
          reps: 10,
          load: 0,
          unit: "kg",
        },
      ]),
      makeSession("s2", "2026-11-13", [
        {
          exercise_name: "Press inclinado mancuernas",
          muscle_group: "pecho",
          reps: 8,
          load: 32,
          unit: "kg",
        },
        {
          exercise_name: "Press inclinado mancuernas",
          muscle_group: "pecho",
          reps: 10,
          load: 30,
          unit: "kg",
        },
        {
          exercise_name: "Sentadilla búlgara",
          muscle_group: "cuadriceps",
          reps: 6,
          load: 90,
          unit: "kg",
        },
        {
          exercise_name: "Dominadas",
          muscle_group: "espalda",
          reps: 12,
          load: 0,
          unit: "kg",
        },
      ]),
      makeSession("s1", "2026-11-06", [
        {
          exercise_name: "press  inclinado mancuernas",
          muscle_group: "pecho",
          reps: 15, // >12 reps -> e1RM null, bestLoad still 28 kg
          load: 28,
          unit: "kg",
        },
      ]),
    ];

    const series = aggregateExerciseProgression(sessions);
    expect(series.map((s) => s.exerciseKey)).toEqual([
      "press inclinado mancuernas",
      "sentadilla bulgara",
    ]);

    const press = series[0];
    expect(press.exerciseName).toBe("Press inclinado mancuernas");
    expect(press.points).toHaveLength(3);
    expect(press.points.map((p) => p.sessionDate)).toEqual([
      "2026-11-06",
      "2026-11-13",
      "2026-11-20",
    ]);
    // 28 kg x 15 -> e1RM null, bestLoadKg 28
    expect(press.points[0].bestE1rmKg).toBeNull();
    expect(press.points[0].bestLoadKg).toBe(28);
    // 32 kg x 8 -> e1RM 40.53 kg (higher than 30 kg x 10 = 40 kg)
    expect(press.points[1].bestE1rmKg).toBe(40.53);
    expect(press.points[1].bestLoadKg).toBe(32);
    // 34 kg x 9 -> e1RM 44.2 kg
    expect(press.points[2].bestE1rmKg).toBe(44.2);
    expect(press.points[2].bestLoadKg).toBe(34);
    expect(press.hasE1rmSeries).toBe(true);
    expect(press.latestE1rmKg).toBe(44.2);
    expect(press.e1rmDeltaKg).toBe(3.67); // 44.2 - 40.53
    expect(press.latestBestLoadKg).toBe(34);
    expect(press.bestLoadDeltaKg).toBe(6); // 34 - 28

    const squat = series[1];
    expect(squat.points).toHaveLength(2);
    // 90 kg x 6 -> 108 kg e1RM
    expect(squat.points[0].bestLoadKg).toBe(90);
    expect(squat.points[0].bestE1rmKg).toBe(108);
    // 220 lb x 5 -> 99.79 kg load, 116.42 kg e1RM
    expect(squat.points[1].bestLoadKg).toBe(99.79);
    expect(squat.points[1].bestE1rmKg).toBe(116.42);
    expect(squat.points[1].bestLoadUnit).toBe("lb");
    expect(squat.points[1].bestLoadDisplay).toBe(220);
    expect(squat.points[1].bestLoadReps).toBe(5);
    expect(squat.e1rmDeltaKg).toBe(8.42);
  });

  it("tracks bestLoadReps separately from bestE1rmLoadKg and bestE1rmReps when different sets win load vs e1RM", () => {
    const sessions: TrainingSessionResponse[] = [
      makeSession("s-prev", "2026-11-10", [
        {
          exercise_name: "Press banca",
          muscle_group: "pecho",
          reps: 5,
          load: 95,
          unit: "kg",
        },
      ]),
      makeSession("s-split", "2026-11-17", [
        // Heavy low-rep top set: best load = 100 kg x 3 (e1RM = 110 kg)
        {
          exercise_name: "Press banca",
          muscle_group: "pecho",
          reps: 3,
          load: 100,
          unit: "kg",
        },
        // Higher-rep back-off set: best e1RM = 90 kg x 10 (e1RM = 120 kg)
        {
          exercise_name: "Press banca",
          muscle_group: "pecho",
          reps: 10,
          load: 90,
          unit: "kg",
        },
      ]),
    ];

    const series = aggregateExerciseProgression(sessions);
    expect(series).toHaveLength(1);
    const splitPoint = series[0].points[1];
    expect(splitPoint.bestLoadKg).toBe(100);
    expect(splitPoint.bestLoadReps).toBe(3);
    expect(splitPoint.bestE1rmKg).toBe(120);
    expect(splitPoint.bestE1rmLoadKg).toBe(90);
    expect(splitPoint.bestE1rmReps).toBe(10);
  });
});
