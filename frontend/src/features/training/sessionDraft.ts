import { normalizeExerciseKey } from "./progression";
import type {
  EditableExerciseGroup,
  EditableExerciseSet,
  EditableSetRow,
  SessionSetInput,
  TodaySessionResponse,
  TrainingSessionResponse,
} from "./types";

export const SESSION_DRAFT_KEY = "fc-training-session-draft-v1";
const SESSION_DRAFT_PREFIX = `${SESSION_DRAFT_KEY}:`;

export function getSessionDraftStorageKey(
  athleteKey: string | null | undefined,
): string | null {
  const id = athleteKey?.trim();
  return id ? `${SESSION_DRAFT_PREFIX}${id}` : null;
}

export interface PersistedSessionDraft {
  version: 2;
  sessionDate: string;
  sessionName: string;
  sessionPlannedId: string | null;
  fatigueNotes: string;
  exerciseGroups: EditableExerciseGroup[];
  startedFromToday: boolean;
}

interface LegacyPersistedSessionDraft {
  sessionDate?: string;
  sessionName?: string;
  sessionPlannedId?: string | null;
  fatigueNotes?: string;
  setRows?: EditableSetRow[];
  startedFromToday?: boolean;
}

let idSeq = 1;

function nextLocalId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now().toString(36)}-${idSeq}`;
}

export function createDefaultExerciseSet(
  overrides: Partial<EditableExerciseSet> = {},
): EditableExerciseSet {
  return {
    id: nextLocalId("set"),
    reps: "8",
    load: "",
    rir: "2",
    rpe: "",
    completed: false,
    ...overrides,
  };
}

export function createDefaultExerciseGroup(
  overrides: Partial<EditableExerciseGroup> = {},
): EditableExerciseGroup {
  return {
    id: nextLocalId("ex"),
    exercise_name: "",
    muscle_group: "pecho",
    secondary_muscle_groups: "",
    unit: "kg",
    isBodyweight: false,
    sets: [createDefaultExerciseSet()],
    ...overrides,
  };
}

export function adjustLoadValue(currentLoad: string, delta: number): string {
  const normalized = currentLoad.trim().replace(",", ".");
  const parsed = normalized === "" ? 0 : Number(normalized);
  const base = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const next = Math.max(0, Math.round((base + delta) * 100) / 100);
  return String(next);
}

/**
 * Groups contiguous flat set rows (from legacy drafts or saved sessions) by exercise name.
 */
export function groupFlatSetsIntoExercises(rows: EditableSetRow[]): EditableExerciseGroup[] {
  if (rows.length === 0) {
    return [createDefaultExerciseGroup()];
  }

  const groups: EditableExerciseGroup[] = [];

  for (const row of rows) {
    const key = normalizeExerciseKey(row.exercise_name);
    const prev = groups[groups.length - 1];
    const sameAsPrev =
      prev !== undefined &&
      key.length > 0 &&
      normalizeExerciseKey(prev.exercise_name) === key &&
      prev.unit === (row.unit === "lb" ? "lb" : "kg");

    const setItem = createDefaultExerciseSet({
      reps: row.reps,
      load: row.load,
      rir: row.rir,
      rpe: row.rpe,
      completed: false,
    });

    if (sameAsPrev) {
      prev.sets.push(setItem);
      if (!prev.targetHint && row.targetHint) prev.targetHint = row.targetHint;
      if (!prev.previousMarkHint && row.previousMarkHint) {
        prev.previousMarkHint = row.previousMarkHint;
      }
    } else {
      const loadTrimmed = row.load.trim();
      const isZeroLoad = loadTrimmed !== "" && Number(loadTrimmed.replace(",", ".")) === 0;
      groups.push(
        createDefaultExerciseGroup({
          exercise_name: row.exercise_name,
          muscle_group: row.muscle_group || "pecho",
          secondary_muscle_groups: row.secondary_muscle_groups ?? "",
          unit: row.unit === "lb" ? "lb" : "kg",
          isBodyweight: isZeroLoad,
          targetHint: row.targetHint,
          previousMarkHint: row.previousMarkHint,
          sets: [setItem],
        }),
      );
    }
  }

  // Only keep isBodyweight=true if every non-empty set in the group is 0
  for (const group of groups) {
    const hasPositiveLoad = group.sets.some((s) => {
      const n = Number(s.load.trim().replace(",", "."));
      return s.load.trim() !== "" && Number.isFinite(n) && n > 0;
    });
    if (hasPositiveLoad) {
      group.isBodyweight = false;
    }
  }

  return groups;
}

export function buildGroupsFromTodaySession(
  todayData: TodaySessionResponse,
): EditableExerciseGroup[] {
  const groups: EditableExerciseGroup[] = [];

  for (const item of todayData.exercises) {
    const totalSets = Math.max(1, item.planned.target_sets || 1);
    const targetHint = `${totalSets} series · ${item.planned.rep_range_min}–${item.planned.rep_range_max} reps${
      item.planned.target_rir !== null && item.planned.target_rir !== undefined
        ? ` · RIR ${item.planned.target_rir}`
        : ""
    }`;
    const previousMarkHint = item.previous_mark
      ? `Marca previa (${item.previous_mark.last_session_date}): ${item.previous_mark.best_load} ${item.previous_mark.best_unit} × ${item.previous_mark.best_reps}${
          item.previous_mark.best_rir !== null && item.previous_mark.best_rir !== undefined
            ? ` @ RIR ${item.previous_mark.best_rir}`
            : ""
        }`
      : "Sin marcas previas registradas";

    const unit: "kg" | "lb" =
      (item.previous_mark?.last_sets?.[0]?.unit ?? item.previous_mark?.best_unit) === "lb"
        ? "lb"
        : "kg";

    const sets: EditableExerciseSet[] = [];
    for (let s = 0; s < totalSets; s += 1) {
      const prevSet = item.previous_mark?.last_sets?.[s];
      const prefillLoad =
        prevSet?.load !== undefined
          ? String(prevSet.load)
          : item.previous_mark?.best_load !== undefined
            ? String(item.previous_mark.best_load)
            : "";

      sets.push(
        createDefaultExerciseSet({
          reps: String(
            prevSet?.reps ?? item.previous_mark?.best_reps ?? item.planned.rep_range_min ?? 8,
          ),
          load: prefillLoad,
          rir: String(prevSet?.rir ?? item.planned.target_rir ?? 2),
          rpe: "",
          completed: false,
        }),
      );
    }

    const allPrefilledZero =
      sets.length > 0 &&
      sets.every((s) => s.load.trim() !== "" && Number(s.load.trim()) === 0);

    groups.push(
      createDefaultExerciseGroup({
        exercise_name: item.planned.exercise_name,
        muscle_group: item.planned.primary_muscle_group,
        secondary_muscle_groups: (item.planned.secondary_muscle_groups ?? []).join(", "),
        unit,
        isBodyweight: allPrefilledZero,
        targetHint,
        previousMarkHint,
        sets,
      }),
    );
  }

  return groups.length > 0 ? groups : [createDefaultExerciseGroup()];
}

export function buildGroupsFromSession(session: TrainingSessionResponse): EditableExerciseGroup[] {
  const flat: EditableSetRow[] = session.sets.map((s) => ({
    exercise_name: s.exercise_name,
    muscle_group: s.muscle_group,
    secondary_muscle_groups: (s.secondary_muscle_groups ?? []).join(", "),
    reps: String(s.reps),
    load: String(s.load),
    unit: s.unit === "lb" ? "lb" : "kg",
    rir: s.rir !== null && s.rir !== undefined ? String(s.rir) : "",
    rpe: s.rpe !== null && s.rpe !== undefined ? String(s.rpe) : "",
  }));
  return groupFlatSetsIntoExercises(flat);
}

export function validateAndFlattenGroups(groups: EditableExerciseGroup[]): {
  sets: SessionSetInput[];
  error: string | null;
} {
  if (groups.length === 0 || !groups.some((g) => g.exercise_name.trim().length > 0)) {
    return {
      sets: [],
      error: "Añade al menos un ejercicio con nombre y al menos una serie.",
    };
  }

  const flattened: SessionSetInput[] = [];
  let setOrder = 1;

  for (let gIdx = 0; gIdx < groups.length; gIdx += 1) {
    const group = groups[gIdx];
    const exerciseName = group.exercise_name.trim();
    if (!exerciseName) {
      return {
        sets: [],
        error: `Falta el nombre del ejercicio en el bloque ${gIdx + 1}. Escribe un nombre o quita el bloque antes de guardar.`,
      };
    }
    const muscleGroup = group.muscle_group.trim() || "pecho";
    const secondary = group.secondary_muscle_groups
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    if (group.sets.length === 0) {
      return {
        sets: [],
        error: `El ejercicio «${exerciseName}» necesita al menos una serie.`,
      };
    }

    for (let i = 0; i < group.sets.length; i += 1) {
      const set = group.sets[i];
      const setNum = i + 1;
      const repsRaw = Number(set.reps.trim());
      if (!Number.isFinite(repsRaw) || repsRaw < 1 || repsRaw > 200) {
        return {
          sets: [],
          error: `Indica repeticiones válidas (1–200) en «${exerciseName}» (serie ${setNum}).`,
        };
      }

      const loadStr = set.load.trim().replace(",", ".");
      let loadVal = 0;

      if (group.isBodyweight) {
        if (loadStr !== "") {
          const parsed = Number(loadStr);
          if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2000) {
            return {
              sets: [],
              error: `La carga adicional de «${exerciseName}» (serie ${setNum}) debe ser un número válido (0–2000).`,
            };
          }
          loadVal = parsed;
        }
      } else {
        if (loadStr === "") {
          return {
            sets: [],
            error: `Falta la carga en «${exerciseName}» (serie ${setNum}). Introduce el peso o marca «Peso corporal».`,
          };
        }
        const parsed = Number(loadStr);
        if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 2000) {
          return {
            sets: [],
            error: `Indica una carga mayor que 0 en «${exerciseName}» (serie ${setNum}) o activa «Peso corporal».`,
          };
        }
        loadVal = parsed;
      }

      const rirStr = set.rir.trim().replace(",", ".");
      const rpeStr = set.rpe.trim().replace(",", ".");
      const rirVal = rirStr !== "" ? Number(rirStr) : null;
      const rpeVal = rpeStr !== "" ? Number(rpeStr) : null;

      flattened.push({
        exercise_name: exerciseName,
        muscle_group: muscleGroup,
        secondary_muscle_groups: secondary,
        set_order: setOrder,
        reps: Math.round(repsRaw),
        load: loadVal,
        unit: group.unit,
        rir: rirVal !== null && Number.isFinite(rirVal) ? rirVal : null,
        rpe: rpeVal !== null && Number.isFinite(rpeVal) ? rpeVal : null,
      });
      setOrder += 1;
    }
  }

  return { sets: flattened, error: null };
}

export function hasSessionDraftContent(
  groups: EditableExerciseGroup[],
  fatigueNotes: string,
): boolean {
  return (
    groups.some((g) => g.exercise_name.trim().length > 0) || fatigueNotes.trim().length > 0
  );
}

function parseRawSessionDraft(raw: string): PersistedSessionDraft | null {
  const parsed = JSON.parse(raw) as Partial<PersistedSessionDraft> & LegacyPersistedSessionDraft;

  // New v2 grouped draft format
  if (Array.isArray(parsed.exerciseGroups) && parsed.exerciseGroups.length > 0) {
    const normalizedGroups: EditableExerciseGroup[] = parsed.exerciseGroups.map((g) => ({
      id: g.id || nextLocalId("ex"),
      exercise_name: typeof g.exercise_name === "string" ? g.exercise_name : "",
      muscle_group: typeof g.muscle_group === "string" && g.muscle_group ? g.muscle_group : "pecho",
      secondary_muscle_groups:
        typeof g.secondary_muscle_groups === "string" ? g.secondary_muscle_groups : "",
      unit: g.unit === "lb" ? "lb" : "kg",
      isBodyweight: Boolean(g.isBodyweight),
      targetHint: g.targetHint,
      previousMarkHint: g.previousMarkHint,
      sets:
        Array.isArray(g.sets) && g.sets.length > 0
          ? g.sets.map((s) => ({
              id: s.id || nextLocalId("set"),
              reps: typeof s.reps === "string" ? s.reps : "8",
              load: typeof s.load === "string" ? s.load : "",
              rir: typeof s.rir === "string" ? s.rir : "",
              rpe: typeof s.rpe === "string" ? s.rpe : "",
              completed: Boolean(s.completed),
            }))
          : [createDefaultExerciseSet()],
    }));
    return {
      version: 2,
      sessionDate: parsed.sessionDate ?? new Date().toISOString().slice(0, 10),
      sessionName: parsed.sessionName ?? "Sesión de Entrenamiento",
      sessionPlannedId: parsed.sessionPlannedId ?? null,
      fatigueNotes: parsed.fatigueNotes ?? "",
      exerciseGroups: normalizedGroups,
      startedFromToday: Boolean(parsed.startedFromToday),
    };
  }

  // Legacy v1 flat setRows draft migration
  if (Array.isArray(parsed.setRows) && parsed.setRows.length > 0) {
    return {
      version: 2,
      sessionDate: parsed.sessionDate ?? new Date().toISOString().slice(0, 10),
      sessionName: parsed.sessionName ?? "Sesión de Entrenamiento",
      sessionPlannedId: parsed.sessionPlannedId ?? null,
      fatigueNotes: parsed.fatigueNotes ?? "",
      exerciseGroups: groupFlatSetsIntoExercises(parsed.setRows),
      startedFromToday: Boolean(parsed.startedFromToday),
    };
  }

  return null;
}

export function readPersistedSessionDraft(
  athleteKey: string | null | undefined,
): PersistedSessionDraft | null {
  const scopedKey = getSessionDraftStorageKey(athleteKey);
  if (!scopedKey) return null;

  try {
    const scopedRaw = window.localStorage.getItem(scopedKey);
    if (scopedRaw) {
      return parseRawSessionDraft(scopedRaw);
    }

    // One-shot safe migration from legacy unscoped key -> scoped Athlete key, then clear legacy key
    // so a second Athlete sharing the same browser never inherits the draft.
    const legacyRaw = window.localStorage.getItem(SESSION_DRAFT_KEY);
    if (!legacyRaw) return null;

    const migrated = parseRawSessionDraft(legacyRaw);
    window.localStorage.removeItem(SESSION_DRAFT_KEY);
    if (migrated) {
      window.localStorage.setItem(scopedKey, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return null;
  }
}

export function writePersistedSessionDraft(
  draft: PersistedSessionDraft,
  athleteKey: string | null | undefined,
): void {
  const scopedKey = getSessionDraftStorageKey(athleteKey);
  if (!scopedKey) return;
  try {
    window.localStorage.setItem(scopedKey, JSON.stringify(draft));
    window.localStorage.removeItem(SESSION_DRAFT_KEY);
  } catch {
    // Ignore storage quota/availability errors
  }
}

export function clearPersistedSessionDraft(athleteKey: string | null | undefined): void {
  const scopedKey = getSessionDraftStorageKey(athleteKey);
  try {
    if (scopedKey) {
      window.localStorage.removeItem(scopedKey);
    }
    window.localStorage.removeItem(SESSION_DRAFT_KEY);
  } catch {
    // Ignore storage unavailability
  }
}
