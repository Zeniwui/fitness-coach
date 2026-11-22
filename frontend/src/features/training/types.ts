import type { components } from "../../api/generated/schema";

export type MesocycleResponse = components["schemas"]["MesocycleResponse"];
export type TodaySessionResponse = components["schemas"]["TodaySessionResponse"];
export type TrainingSessionResponse = components["schemas"]["TrainingSessionResponse"];
export type WeeklyVolumeSummaryResponse = components["schemas"]["WeeklyVolumeSummaryResponse"];
export type PlannedExerciseSchema = components["schemas"]["PlannedExerciseSchema"];
export type PlannedSessionInput = components["schemas"]["PlannedSessionInput"];
export type SessionSetInput = components["schemas"]["SessionSetInput"];

export type TrainingTabKey = "today" | "sessions" | "mesocycles" | "volume";

export interface ConflictModalState {
  targetMesocycleId: string;
  targetMesocycleName: string;
  activeMesocycleName: string;
}

/**
 * Legacy flat set row format retained for safe migration of existing v1 localStorage drafts.
 */
export interface EditableSetRow {
  exercise_name: string;
  muscle_group: string;
  secondary_muscle_groups: string;
  reps: string;
  load: string;
  unit: "kg" | "lb";
  rir: string;
  rpe: string;
  targetHint?: string;
  previousMarkHint?: string;
}

export interface EditableExerciseSet {
  id: string;
  reps: string;
  load: string;
  rir: string;
  rpe: string;
  completed: boolean;
}

export interface EditableExerciseGroup {
  id: string;
  exercise_name: string;
  muscle_group: string;
  secondary_muscle_groups: string;
  unit: "kg" | "lb";
  isBodyweight: boolean;
  targetHint?: string;
  previousMarkHint?: string;
  sets: EditableExerciseSet[];
}

export interface EditablePlannedExercise {
  id: string;
  exercise_name: string;
  primary_muscle_group: string;
  secondary_muscle_groups_raw: string;
  target_sets: string;
  rep_range_min: string;
  rep_range_max: string;
  target_rir: string;
  target_rpe: number | null;
  notes: string | null;
}

export interface EditablePlannedSession {
  id: string;
  day_order: number;
  name: string;
  exercises: EditablePlannedExercise[];
}

export function statusBadgeLabel(status: string): string {
  switch (status) {
    case "active":
      return "Activo";
    case "deload":
      return "En descarga";
    case "draft":
      return "Borrador";
    case "completed":
      return "Completado";
    case "archived":
      return "Archivado";
    default:
      return status;
  }
}

export function statusBadgeTone(
  status: string,
): "success" | "warning" | "secondary" | "neutral" {
  switch (status) {
    case "active":
      return "success";
    case "deload":
      return "warning";
    case "draft":
      return "secondary";
    default:
      return "neutral";
  }
}
