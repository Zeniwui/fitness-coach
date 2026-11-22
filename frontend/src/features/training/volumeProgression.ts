import {
  extractSessionExerciseBests,
  isEffectiveSet,
  normalizeExerciseKey,
  round2,
  type LoadUnit,
} from "./progression";
import type { TrainingSessionResponse } from "./types";

export interface WeeklyEffectiveVolumeBucket {
  weekStart: string;
  sessionCount: number;
  totalEffectiveSets: number;
  byMuscleGroup: Record<string, number>;
}

export interface MultiWeekVolumeResult {
  muscleGroups: string[];
  weeks: WeeklyEffectiveVolumeBucket[];
}

export interface WeeklyVolumePoint {
  weekStart: string;
  effectiveSets: number;
  sessionCount: number;
}

export interface ExerciseSessionPoint {
  sessionId: string;
  sessionDate: string;
  sessionName: string;
  bestLoadKg: number;
  bestLoadDisplay: number;
  bestLoadUnit: LoadUnit;
  bestLoadReps: number;
  bestE1rmKg: number | null;
  bestE1rmLoadKg: number | null;
  bestE1rmDisplay: number | null;
  bestE1rmUnit: LoadUnit | null;
  bestE1rmReps: number | null;
}

export interface ExerciseProgressionSeries {
  exerciseKey: string;
  exerciseName: string;
  muscleGroup: string;
  points: ExerciseSessionPoint[];
  hasE1rmSeries: boolean;
  latestE1rmKg: number | null;
  e1rmDeltaKg: number | null;
  latestBestLoadKg: number;
  bestLoadDeltaKg: number;
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function normalizeMuscleGroup(name: string): string {
  const normalized = normalizeExerciseKey(name);
  return normalized || "general";
}

function formatUtcIsoDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the Monday (`YYYY-MM-DD`) starting the ISO week containing `isoDate`.
 */
export function getIsoWeekStart(isoDate: string): string {
  const match = ISO_DATE_RE.exec(isoDate.trim());
  if (!match) return isoDate;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const daysSinceMonday = (utc.getUTCDay() + 6) % 7;
  utc.setUTCDate(utc.getUTCDate() - daysSinceMonday);
  return formatUtcIsoDate(utc);
}

function sortSessionsChronologically(
  sessions: TrainingSessionResponse[],
): TrainingSessionResponse[] {
  return [...sessions].sort((a, b) => {
    const byDate = a.session_date.localeCompare(b.session_date);
    if (byDate !== 0) return byDate;
    const byCreated = a.created_at.localeCompare(b.created_at);
    if (byCreated !== 0) return byCreated;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Aggregates multi-week effective hypertrophy sets (direct = 1.0, secondary = 0.5)
 * reusing the domain `isEffectiveSet` rule across the Athlete's Training Session history.
 */
export function aggregateWeeklyEffectiveVolume(
  sessions: TrainingSessionResponse[],
): MultiWeekVolumeResult {
  if (sessions.length === 0) {
    return { muscleGroups: [], weeks: [] };
  }

  const ordered = sortSessionsChronologically(sessions);
  const weekMap = new Map<
    string,
    {
      weekStart: string;
      sessionIds: Set<string>;
      byMuscleGroup: Record<string, number>;
    }
  >();
  const allMuscles = new Set<string>();

  for (const session of ordered) {
    const effectiveSets = session.sets.filter(isEffectiveSet);
    if (effectiveSets.length === 0) continue;

    const weekStart = getIsoWeekStart(session.session_date);
    let bucket = weekMap.get(weekStart);
    if (!bucket) {
      bucket = {
        weekStart,
        sessionIds: new Set<string>(),
        byMuscleGroup: {},
      };
      weekMap.set(weekStart, bucket);
    }
    bucket.sessionIds.add(session.id);

    for (const set of effectiveSets) {
      const primary = normalizeMuscleGroup(set.muscle_group);
      allMuscles.add(primary);
      bucket.byMuscleGroup[primary] = round2((bucket.byMuscleGroup[primary] ?? 0) + 1);

      const seenSecondary = new Set<string>();
      for (const sec of set.secondary_muscle_groups ?? []) {
        const secNorm = normalizeMuscleGroup(sec);
        if (!secNorm || secNorm === primary || seenSecondary.has(secNorm)) continue;
        seenSecondary.add(secNorm);
        allMuscles.add(secNorm);
        bucket.byMuscleGroup[secNorm] = round2((bucket.byMuscleGroup[secNorm] ?? 0) + 0.5);
      }
    }
  }

  const weeks: WeeklyEffectiveVolumeBucket[] = Array.from(weekMap.values())
    .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
    .map((bucket) => ({
      weekStart: bucket.weekStart,
      sessionCount: bucket.sessionIds.size,
      totalEffectiveSets: round2(
        Object.values(bucket.byMuscleGroup).reduce((sum, val) => sum + val, 0),
      ),
      byMuscleGroup: bucket.byMuscleGroup,
    }));

  const muscleGroups = Array.from(allMuscles).sort((a, b) => a.localeCompare(b, "es"));

  return { muscleGroups, weeks };
}

export function selectWeeklyVolumeSeries(
  result: MultiWeekVolumeResult,
  muscleGroup: string | "all",
): WeeklyVolumePoint[] {
  return result.weeks.map((week) => ({
    weekStart: week.weekStart,
    effectiveSets:
      muscleGroup === "all" ? week.totalEffectiveSets : (week.byMuscleGroup[muscleGroup] ?? 0),
    sessionCount: week.sessionCount,
  }));
}

/**
 * Aggregates chronological Epley e1RM (kg) and best load (kg) per exercise
 * for all exercises with at least 2 recorded sessions with load > 0.
 */
export function aggregateExerciseProgression(
  sessions: TrainingSessionResponse[],
): ExerciseProgressionSeries[] {
  if (sessions.length === 0) return [];

  const ordered = sortSessionsChronologically(sessions);
  const byExercise = new Map<
    string,
    {
      exerciseName: string;
      muscleGroup: string;
      points: ExerciseSessionPoint[];
    }
  >();

  for (const session of ordered) {
    const perSessionExercise = extractSessionExerciseBests(session.sets);

    for (const [key, entry] of perSessionExercise.entries()) {
      const point: ExerciseSessionPoint = {
        sessionId: session.id,
        sessionDate: session.session_date,
        sessionName: session.name,
        bestLoadKg: round2(entry.bestLoadKg),
        bestLoadDisplay: entry.bestLoadSet.load,
        bestLoadUnit: entry.bestLoadSet.unit,
        bestLoadReps: entry.bestLoadSet.reps,
        bestE1rmKg: entry.bestE1rmKg,
        bestE1rmLoadKg: entry.bestE1rmSet ? entry.bestE1rmSet.loadKg : null,
        bestE1rmDisplay: entry.bestE1rmSet ? entry.bestE1rmSet.load : null,
        bestE1rmUnit: entry.bestE1rmSet ? entry.bestE1rmSet.unit : null,
        bestE1rmReps: entry.bestE1rmSet ? entry.bestE1rmSet.reps : null,
      };

      const existing = byExercise.get(key);
      if (!existing) {
        byExercise.set(key, {
          exerciseName: entry.exerciseName,
          muscleGroup: entry.muscleGroup,
          points: [point],
        });
      } else {
        existing.exerciseName = entry.exerciseName;
        existing.muscleGroup = entry.muscleGroup;
        existing.points.push(point);
      }
    }
  }

  const series: ExerciseProgressionSeries[] = [];
  for (const [exerciseKey, data] of byExercise.entries()) {
    if (data.points.length < 2) continue;

    const e1rmValues = data.points
      .map((p) => p.bestE1rmKg)
      .filter((v): v is number => v !== null);
    const hasE1rmSeries = e1rmValues.length >= 2;
    const latestE1rmKg = e1rmValues.length > 0 ? e1rmValues[e1rmValues.length - 1] : null;
    const e1rmDeltaKg = hasE1rmSeries
      ? round2(e1rmValues[e1rmValues.length - 1] - e1rmValues[0])
      : null;

    const firstLoad = data.points[0].bestLoadKg;
    const latestBestLoadKg = data.points[data.points.length - 1].bestLoadKg;
    const bestLoadDeltaKg = round2(latestBestLoadKg - firstLoad);

    series.push({
      exerciseKey,
      exerciseName: data.exerciseName,
      muscleGroup: data.muscleGroup,
      points: data.points,
      hasE1rmSeries,
      latestE1rmKg,
      e1rmDeltaKg,
      latestBestLoadKg,
      bestLoadDeltaKg,
    });
  }

  return series.sort((a, b) => {
    const aLatest = a.points[a.points.length - 1].sessionDate;
    const bLatest = b.points[b.points.length - 1].sessionDate;
    const byRecency = bLatest.localeCompare(aLatest);
    if (byRecency !== 0) return byRecency;
    if (b.points.length !== a.points.length) return b.points.length - a.points.length;
    return a.exerciseName.localeCompare(b.exerciseName, "es");
  });
}
