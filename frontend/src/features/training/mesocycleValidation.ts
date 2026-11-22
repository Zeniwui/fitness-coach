import type { EditablePlannedSession } from "./types";

export function validateAndSanitizePlannedSessions(
  plannedSessions: EditablePlannedSession[],
): { sessions: EditablePlannedSession[]; error: string | null } {
  if (plannedSessions.length === 0) {
    return {
      sessions: [],
      error: "El Mesociclo debe incluir al menos un día planificado.",
    };
  }

  const sanitized: EditablePlannedSession[] = [];
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
      const repMin = Math.max(1, ex.rep_range_min ?? 8);
      const repMax = Math.max(1, ex.rep_range_max ?? 12);
      if (repMax < repMin) {
        return {
          sessions: [],
          error: `En «${exName}» («${dayName}»), las repeticiones máximas deben ser mayores o iguales a las mínimas.`,
        };
      }
      cleanedExercises.push({
        ...ex,
        exercise_name: exName,
        primary_muscle_group: primary,
        secondary_muscle_groups: (ex.secondary_muscle_groups ?? []).filter(Boolean),
        target_sets: Math.min(20, Math.max(1, ex.target_sets ?? 3)),
        rep_range_min: repMin,
        rep_range_max: repMax,
        target_rir:
          ex.target_rir !== null && ex.target_rir !== undefined && Number.isFinite(ex.target_rir)
            ? ex.target_rir
            : null,
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
