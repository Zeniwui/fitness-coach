import type { SessionSetInput, TrainingSessionResponse } from "./types";

export const LB_TO_KG = 0.45359237;
export const EPLEY_MAX_REPS = 12;

const COMPARISON_EPSILON_KG = 0.005;

export type LoadUnit = "kg" | "lb";

export interface PersonalRecordHit {
  exerciseName: string;
  kind: "e1rm" | "load" | "both";
  newBestLoadKg: number;
  previousBestLoadKg: number;
  displayLoad: number;
  displayUnit: LoadUnit;
  displayReps: number;
  newE1rmKg: number | null;
  previousE1rmKg: number | null;
}

export interface SessionAchievementSummary {
  sessionName: string;
  totalSets: number;
  effectiveSets: number;
  personalRecords: PersonalRecordHit[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Canonical lowercase, accent-free exercise key matching backend domain normalization.
 */
export function normalizeExerciseKey(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Convert a recorded load to kilograms.
 */
export function convertLoadToKg(load: number, unit: LoadUnit = "kg"): number {
  return unit === "lb" ? load * LB_TO_KG : load;
}

/**
 * Standard Epley estimated 1RM in kg: `load * (1 + reps / 30)` for `2 <= reps <= 12`,
 * exact `load` for `reps === 1`, and `null` when load <= 0 (bodyweight) or reps > 12.
 */
export function calculateEpleyE1rmKg(
  load: number,
  reps: number,
  unit: LoadUnit = "kg",
): number | null {
  if (
    !Number.isFinite(load) ||
    !Number.isFinite(reps) ||
    load <= 0 ||
    reps < 1 ||
    reps > EPLEY_MAX_REPS
  ) {
    return null;
  }
  const kg = convertLoadToKg(load, unit);
  if (reps === 1) {
    return round2(kg);
  }
  return round2(kg * (1 + reps / 30));
}

/**
 * Matches backend domain rule: sets with RIR <= 4 (or RPE >= 6, or unspecified) count as effective.
 */
export function isEffectiveSet(set: Pick<SessionSetInput, "rir" | "rpe">): boolean {
  if (set.rir !== null && set.rir !== undefined) {
    return set.rir <= 4;
  }
  if (set.rpe !== null && set.rpe !== undefined) {
    return set.rpe >= 6;
  }
  return true;
}

interface ExerciseHistoryBest {
  bestLoadKg: number;
  bestE1rmKg: number | null;
}

function buildPriorExerciseBests(
  priorSessions: TrainingSessionResponse[],
  excludeSessionId?: string | null,
): Map<string, ExerciseHistoryBest> {
  const bests = new Map<string, ExerciseHistoryBest>();

  for (const session of priorSessions) {
    if (excludeSessionId && session.id === excludeSessionId) {
      continue;
    }
    for (const set of session.sets) {
      if (set.load <= 0) continue;
      const key = normalizeExerciseKey(set.exercise_name);
      if (!key) continue;
      const unit: LoadUnit = set.unit === "lb" ? "lb" : "kg";
      const loadKg = convertLoadToKg(set.load, unit);
      const e1rmKg = calculateEpleyE1rmKg(set.load, set.reps, unit);

      const current = bests.get(key);
      if (!current) {
        bests.set(key, { bestLoadKg: loadKg, bestE1rmKg: e1rmKg });
      } else {
        if (loadKg > current.bestLoadKg) {
          current.bestLoadKg = loadKg;
        }
        if (e1rmKg !== null && (current.bestE1rmKg === null || e1rmKg > current.bestE1rmKg)) {
          current.bestE1rmKg = e1rmKg;
        }
      }
    }
  }

  return bests;
}

/**
 * Computes effective set totals and beaten personal records (load and/or Epley e1RM)
 * against the Athlete's prior Training Sessions.
 */
export function evaluateSessionAchievements(
  savedSets: SessionSetInput[],
  priorSessions: TrainingSessionResponse[],
  sessionName: string,
  excludeSessionId?: string | null,
): SessionAchievementSummary {
  const totalSets = savedSets.length;
  const effectiveSets = savedSets.filter(isEffectiveSet).length;
  const priorBests = buildPriorExerciseBests(priorSessions, excludeSessionId);

  const groupedNew = new Map<
    string,
    {
      exerciseName: string;
      bestLoadKg: number;
      bestLoadSet: { load: number; unit: LoadUnit; reps: number };
      bestE1rmKg: number | null;
      bestE1rmSet: { load: number; unit: LoadUnit; reps: number } | null;
    }
  >();

  for (const set of savedSets) {
    if (set.load <= 0) continue;
    const key = normalizeExerciseKey(set.exercise_name);
    if (!key) continue;
    const unit: LoadUnit = set.unit === "lb" ? "lb" : "kg";
    const loadKg = convertLoadToKg(set.load, unit);
    const e1rmKg = calculateEpleyE1rmKg(set.load, set.reps, unit);

    const existing = groupedNew.get(key);
    if (!existing) {
      groupedNew.set(key, {
        exerciseName: set.exercise_name.trim(),
        bestLoadKg: loadKg,
        bestLoadSet: { load: set.load, unit, reps: set.reps },
        bestE1rmKg: e1rmKg,
        bestE1rmSet: e1rmKg !== null ? { load: set.load, unit, reps: set.reps } : null,
      });
    } else {
      if (loadKg > existing.bestLoadKg) {
        existing.bestLoadKg = loadKg;
        existing.bestLoadSet = { load: set.load, unit, reps: set.reps };
      }
      if (e1rmKg !== null && (existing.bestE1rmKg === null || e1rmKg > existing.bestE1rmKg)) {
        existing.bestE1rmKg = e1rmKg;
        existing.bestE1rmSet = { load: set.load, unit, reps: set.reps };
      }
    }
  }

  const personalRecords: PersonalRecordHit[] = [];

  for (const [key, current] of groupedNew.entries()) {
    const prior = priorBests.get(key);
    if (!prior) continue;

    const beatLoad = current.bestLoadKg > prior.bestLoadKg + COMPARISON_EPSILON_KG;
    const beatE1rm =
      current.bestE1rmKg !== null &&
      prior.bestE1rmKg !== null &&
      current.bestE1rmKg > prior.bestE1rmKg + COMPARISON_EPSILON_KG;

    if (!beatLoad && !beatE1rm) continue;

    const kind: PersonalRecordHit["kind"] =
      beatLoad && beatE1rm ? "both" : beatE1rm ? "e1rm" : "load";
    const highlightSet =
      kind === "load" ? current.bestLoadSet : (current.bestE1rmSet ?? current.bestLoadSet);

    personalRecords.push({
      exerciseName: current.exerciseName,
      kind,
      newBestLoadKg: round2(current.bestLoadKg),
      previousBestLoadKg: round2(prior.bestLoadKg),
      displayLoad: highlightSet.load,
      displayUnit: highlightSet.unit,
      displayReps: highlightSet.reps,
      newE1rmKg: current.bestE1rmKg,
      previousE1rmKg: prior.bestE1rmKg,
    });
  }

  return {
    sessionName,
    totalSets,
    effectiveSets,
    personalRecords,
  };
}
