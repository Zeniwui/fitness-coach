import type {
  EditablePlannedExercise,
  EditablePlannedSession,
  MesocycleResponse,
  PlannedSessionInput,
} from "./types";

let editorIdSeq = 1;

function nextEditorId(prefix: string): string {
  editorIdSeq += 1;
  return `${prefix}-${editorIdSeq}`;
}

export function createDefaultPlannedExercise(): EditablePlannedExercise {
  return {
    id: nextEditorId("pex"),
    exercise_name: "",
    primary_muscle_group: "hombros",
    secondary_muscle_groups_raw: "",
    target_sets: "3",
    rep_range_min: "8",
    rep_range_max: "12",
    target_rir: "2",
    target_rpe: null,
    notes: null,
  };
}

export function createDefaultPlannedDay(dayOrder: number): EditablePlannedSession {
  return {
    id: nextEditorId("pday"),
    day_order: dayOrder,
    name: `Día ${dayOrder}`,
    exercises: [createDefaultPlannedExercise()],
  };
}

export function mesocycleToEditablePlannedSessions(
  meso: MesocycleResponse,
): EditablePlannedSession[] {
  return meso.planned_sessions.map((ps) => ({
    id: ps.id || nextEditorId("pday"),
    day_order: ps.day_order,
    name: ps.name,
    exercises: ps.exercises.map((ex) => ({
      id: nextEditorId("pex"),
      exercise_name: ex.exercise_name,
      primary_muscle_group: ex.primary_muscle_group,
      secondary_muscle_groups_raw: (ex.secondary_muscle_groups ?? []).join(", "),
      target_sets: String(ex.target_sets ?? 3),
      rep_range_min: String(ex.rep_range_min ?? 8),
      rep_range_max: String(ex.rep_range_max ?? 12),
      target_rir: ex.target_rir !== null && ex.target_rir !== undefined ? String(ex.target_rir) : "",
      target_rpe: ex.target_rpe ?? null,
      notes: ex.notes ?? null,
    })),
  }));
}

function parseIntegerField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
}

export function validateAndSanitizePlannedSessions(
  plannedSessions: EditablePlannedSession[],
): { sessions: PlannedSessionInput[]; error: string | null } {
  if (plannedSessions.length === 0) {
    return {
      sessions: [],
      error: "El Mesociclo debe incluir al menos un día planificado.",
    };
  }

  const sanitized: PlannedSessionInput[] = [];
  for (let dIdx = 0; dIdx < plannedSessions.length; dIdx += 1) {
    const day = plannedSessions[dIdx];
    const dayName = day.name.trim();
    if (!dayName) {
      return {
        sessions: [],
        error: `Indica un nombre para el Día ${dIdx + 1}.`,
      };
    }
    if (day.exercises.length === 0) {
      return {
        sessions: [],
        error: `El día «${dayName}» debe incluir al menos un ejercicio.`,
      };
    }

    const cleanedExercises = [];
    for (let eIdx = 0; eIdx < day.exercises.length; eIdx += 1) {
      const ex = day.exercises[eIdx];
      const exName = ex.exercise_name.trim();
      const primary = ex.primary_muscle_group.trim();
      if (!exName || !primary) {
        return {
          sessions: [],
          error: `Completa el nombre y el grupo muscular del ejercicio ${eIdx + 1} en «${dayName}».`,
        };
      }

      const targetSets = parseIntegerField(ex.target_sets);
      if (targetSets === null || targetSets < 1 || targetSets > 20) {
        return {
          sessions: [],
          error: `En «${exName}» («${dayName}»), las series objetivo deben estar entre 1 y 20.`,
        };
      }

      const repMin = parseIntegerField(ex.rep_range_min);
      const repMax = parseIntegerField(ex.rep_range_max);
      if (repMin === null || repMin < 1 || repMin > 100 || repMax === null || repMax < 1 || repMax > 100) {
        return {
          sessions: [],
          error: `En «${exName}» («${dayName}»), indica un rango de repeticiones válido (1–100).`,
        };
      }
      if (repMax < repMin) {
        return {
          sessions: [],
          error: `En «${exName}» («${dayName}»), las repeticiones máximas deben ser mayores o iguales a las mínimas.`,
        };
      }

      const rirTrimmed = ex.target_rir.trim().replace(",", ".");
      let parsedRir: number | null = null;
      if (rirTrimmed !== "") {
        const num = Number(rirTrimmed);
        if (!Number.isFinite(num) || num < 0 || num > 10) {
          return {
            sessions: [],
            error: `En «${exName}» («${dayName}»), el RIR objetivo debe estar entre 0 y 10.`,
          };
        }
        parsedRir = num;
      }

      const secondaryMuscles = ex.secondary_muscle_groups_raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      cleanedExercises.push({
        exercise_name: exName,
        primary_muscle_group: primary,
        secondary_muscle_groups: secondaryMuscles,
        target_sets: targetSets,
        rep_range_min: repMin,
        rep_range_max: repMax,
        target_rir: parsedRir,
        target_rpe: ex.target_rpe ?? null,
        notes: ex.notes ?? null,
      });
    }

    sanitized.push({
      day_order: dIdx + 1,
      name: dayName,
      exercises: cleanedExercises,
    });
  }

  return { sessions: sanitized, error: null };
}
