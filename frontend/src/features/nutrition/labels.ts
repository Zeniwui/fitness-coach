import type { components } from "../../api/generated/schema";

export type NutritionPhaseType = components["schemas"]["NutritionPhaseType"];
export type NutritionPhaseStatus = components["schemas"]["NutritionPhaseStatus"];
export type NutritionPhaseResponse = components["schemas"]["NutritionPhaseResponse"];
export type WeeklyCheckInResponse = components["schemas"]["WeeklyCheckInResponse"];
export type AdjustmentProposalStatus = components["schemas"]["AdjustmentProposalStatus"];

export const PHASE_TYPE_LABELS: Record<NutritionPhaseType, string> = {
  bulk: "Volumen",
  cut: "Definición",
  maintenance: "Mantenimiento",
  mini_cut: "Mini-cut",
};

export const TREND_STATUS_LABELS: Record<string, string> = {
  insufficient_data: "Sin historial previo suficiente",
  on_track: "En objetivo",
  losing_too_slow: "Pérdida más lenta de lo previsto",
  losing_too_fast: "Pérdida más rápida de lo previsto",
  gaining_too_fast: "Ganancia más rápida de lo previsto",
  gaining_too_slow: "Ganancia más lenta de lo previsto",
};

export const ADJUSTMENT_STATUS_LABELS: Record<AdjustmentProposalStatus, string> = {
  none: "Sin ajuste necesario",
  proposed: "Propuesta pendiente",
  accepted: "Propuesta aplicada",
  dismissed: "Propuesta descartada",
};

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `checkin-${crypto.randomUUID()}`;
  }
  return `checkin-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
