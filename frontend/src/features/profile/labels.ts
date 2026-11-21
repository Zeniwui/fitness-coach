import type { components } from "../../api/generated/schema";

export type BiologicalSex = components["schemas"]["BiologicalSex"];
export type ExperienceLevel = components["schemas"]["ExperienceLevel"];
export type PrimaryGoal = components["schemas"]["PrimaryGoal"];
export type TrainingApproach = components["schemas"]["TrainingApproach"];
export type InjurySeverity = components["schemas"]["InjurySeverity"];
export type InjuryStatus = components["schemas"]["InjuryStatus"];
export type LivingProfileResponse = components["schemas"]["LivingProfileResponse"];
export type InjuryResponse = components["schemas"]["InjuryResponse"];

export const SEX_LABELS: Record<BiologicalSex, string> = {
  male: "Hombre",
  female: "Mujer",
  other: "Otro",
  prefer_not_to_say: "Prefiero no indicarlo",
};

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  beginner: "Principiante",
  intermediate: "Intermedio",
  advanced: "Avanzado",
};

export const GOAL_LABELS: Record<PrimaryGoal, string> = {
  hypertrophy: "Hipertrofia",
  strength: "Fuerza",
  fat_loss: "Definición / pérdida de grasa",
  body_recomposition: "Recomposición corporal",
  maintenance: "Mantenimiento",
};

export const APPROACH_LABELS: Record<TrainingApproach, string> = {
  natural: "Entrenamiento natural (por defecto)",
  enhanced_context_only: "Contexto no natural (solo educativo y reducción de daños)",
};

export const SEVERITY_LABELS: Record<InjurySeverity, string> = {
  mild: "Leve",
  moderate: "Moderada",
  severe: "Severa",
};

export function parseTagInput(raw: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(",")) {
    const cleaned = part.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(cleaned);
    }
  }
  return result;
}
