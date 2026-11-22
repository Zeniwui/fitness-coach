import { describe, expect, it } from "vitest";
import {
  calculateEpleyE1rmKg,
  convertLoadToKg,
  evaluateSessionAchievements,
  isEffectiveSet,
  normalizeExerciseKey,
} from "./progression";
import type { SessionSetInput, TrainingSessionResponse } from "./types";

function makePriorSession(
  id: string,
  sets: Array<{
    exercise_name: string;
    load: number;
    reps: number;
    unit?: "kg" | "lb";
    rir?: number | null;
  }>,
): TrainingSessionResponse {
  return {
    id,
    mesocycle_id: null,
    planned_session_id: null,
    session_date: "2026-11-18",
    name: "Sesión previa",
    origin: "manual_form",
    fatigue_notes: null,
    sets: sets.map((s, idx) => ({
      id: `${id}-set-${idx + 1}`,
      exercise_name: s.exercise_name,
      muscle_group: "pecho",
      secondary_muscle_groups: [],
      set_order: idx + 1,
      reps: s.reps,
      load: s.load,
      unit: s.unit ?? "kg",
      rir: s.rir ?? 2,
      rpe: null,
      notes: null,
    })),
    created_at: "2026-11-18T18:00:00Z",
    updated_at: "2026-11-18T18:00:00Z",
  };
}

function makeSetInput(overrides: Partial<SessionSetInput>): SessionSetInput {
  return {
    exercise_name: "Press inclinado mancuernas",
    muscle_group: "pecho",
    secondary_muscle_groups: [],
    set_order: 1,
    reps: 8,
    load: 32,
    unit: "kg",
    rir: 2,
    rpe: null,
    ...overrides,
  };
}

describe("progression helpers (Epley e1RM and PR detection)", () => {
  it("calculates Epley e1RM for reps 1..12 in kg and lb, and returns null outside valid bounds", () => {
    expect(calculateEpleyE1rmKg(100, 1, "kg")).toBe(100);
    expect(calculateEpleyE1rmKg(100, 10, "kg")).toBe(133.33);
    expect(calculateEpleyE1rmKg(32, 9, "kg")).toBe(41.6);
    expect(calculateEpleyE1rmKg(100, 12, "kg")).toBe(140);
    // lb conversion: 225 * 0.45359237 * (1 + 5 / 30) = 119.06799...
    expect(calculateEpleyE1rmKg(225, 5, "lb")).toBe(119.07);

    // Out of Epley validity range (>12 reps), bodyweight (0 load), or invalid values
    expect(calculateEpleyE1rmKg(100, 13, "kg")).toBeNull();
    expect(calculateEpleyE1rmKg(0, 10, "kg")).toBeNull();
    expect(calculateEpleyE1rmKg(-20, 8, "kg")).toBeNull();
    expect(calculateEpleyE1rmKg(60, 0, "kg")).toBeNull();
    expect(calculateEpleyE1rmKg(Number.NaN, 8, "kg")).toBeNull();

    expect(convertLoadToKg(100, "kg")).toBe(100);
    expect(convertLoadToKg(100, "lb")).toBeCloseTo(45.3592, 4);
    expect(normalizeExerciseKey("  Press  Inclinado  Bíceps ")).toBe("press inclinado biceps");
  });

  it("classifies effective hypertrophy sets using RIR <= 4 or RPE >= 6", () => {
    expect(isEffectiveSet({ rir: 2, rpe: null })).toBe(true);
    expect(isEffectiveSet({ rir: 4, rpe: null })).toBe(true);
    expect(isEffectiveSet({ rir: 5, rpe: null })).toBe(false);
    expect(isEffectiveSet({ rir: null, rpe: 7 })).toBe(true);
    expect(isEffectiveSet({ rir: null, rpe: 5 })).toBe(false);
    expect(isEffectiveSet({ rir: null, rpe: null })).toBe(true);
  });

  it("detects e1RM, load, and combined PRs while respecting kg/lb, bodyweight, and missing history", () => {
    const prior = [
      makePriorSession("sess-1", [
        { exercise_name: "Press inclinado mancuernas", load: 32, reps: 9, unit: "kg" },
        { exercise_name: "Sentadilla búlgara", load: 80, reps: 8, unit: "kg" },
        { exercise_name: "Dominadas", load: 0, reps: 10, unit: "kg" },
      ]),
    ];

    // 1) e1RM PR only (same load 32 kg, more reps: 10 > 9)
    const e1rmOnly = evaluateSessionAchievements(
      [
        makeSetInput({ exercise_name: "Press inclinado mancuernas", load: 32, reps: 10, rir: 1 }),
        makeSetInput({
          exercise_name: "Press inclinado mancuernas",
          load: 20,
          reps: 12,
          rir: 6, // warmup, not effective
          set_order: 2,
        }),
      ],
      prior,
      "Torso A",
    );
    expect(e1rmOnly.totalSets).toBe(2);
    expect(e1rmOnly.effectiveSets).toBe(1);
    expect(e1rmOnly.personalRecords).toHaveLength(1);
    expect(e1rmOnly.personalRecords[0]).toMatchObject({
      exerciseName: "Press inclinado mancuernas",
      kind: "e1rm",
      displayLoad: 32,
      displayUnit: "kg",
      displayReps: 10,
      newE1rmKg: 42.67,
      previousE1rmKg: 41.6,
    });

    // 2) Both load & e1RM PR with lb vs prior kg (185 lb = 83.91 kg > 80 kg) + accent-insensitive match
    const lbPr = evaluateSessionAchievements(
      [
        makeSetInput({
          exercise_name: "sentadilla bulgara",
          load: 185,
          reps: 8,
          unit: "lb",
        }),
      ],
      prior,
      "Pierna A",
    );
    expect(lbPr.personalRecords).toHaveLength(1);
    expect(lbPr.personalRecords[0]).toMatchObject({
      kind: "both",
      displayLoad: 185,
      displayUnit: "lb",
      displayReps: 8,
    });

    // 3) Load-only PR (higher load 35 kg x 1 => e1RM 35 < 41.6, but 35 kg > 32 kg)
    const loadOnly = evaluateSessionAchievements(
      [makeSetInput({ exercise_name: "Press inclinado mancuernas", load: 35, reps: 1 })],
      prior,
      "Fuerza",
    );
    expect(loadOnly.personalRecords).toHaveLength(1);
    expect(loadOnly.personalRecords[0].kind).toBe("load");

    // 4) No prior history, bodyweight-only, and lower lb load (175 lb < 80 kg) -> zero PRs
    const noPr = evaluateSessionAchievements(
      [
        makeSetInput({ exercise_name: "Ejercicio totalmente nuevo", load: 100, reps: 8 }),
        makeSetInput({ exercise_name: "Dominadas", load: 0, reps: 15 }),
        makeSetInput({ exercise_name: "Sentadilla búlgara", load: 175, reps: 8, unit: "lb" }),
      ],
      prior,
      "Control",
    );
    expect(noPr.personalRecords).toEqual([]);
  });

  it("excludes the session being edited when computing PRs", () => {
    const prior = [
      makePriorSession("sess-old", [
        { exercise_name: "Press banca", load: 80, reps: 8, unit: "kg" },
      ]),
      makePriorSession("sess-current", [
        { exercise_name: "Press banca", load: 90, reps: 8, unit: "kg" },
      ]),
    ];

    const summary = evaluateSessionAchievements(
      [makeSetInput({ exercise_name: "Press banca", load: 85, reps: 8 })],
      prior,
      "Torso",
      "sess-current",
    );
    // Against sess-old (80 kg), 85 kg IS a PR when sess-current is excluded
    expect(summary.personalRecords).toHaveLength(1);
    expect(summary.personalRecords[0].kind).toBe("both");
  });
});
