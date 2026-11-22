import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import {
  ADJUSTMENT_STATUS_LABELS,
  TREND_STATUS_LABELS,
  type WeeklyCheckInResponse,
} from "./labels";

interface CoachAdjustmentCardProps {
  latestCheckIn: WeeklyCheckInResponse;
  resolvingAdjustmentId: string | null;
  onApply: (checkinId: string) => void;
  onDismiss: (checkinId: string) => void;
}

export function CoachAdjustmentCard({
  latestCheckIn,
  resolvingAdjustmentId,
  onApply,
  onDismiss,
}: CoachAdjustmentCardProps) {
  const statusTone =
    latestCheckIn.adjustment_status === "accepted"
      ? "success"
      : latestCheckIn.adjustment_status === "proposed"
        ? "accent"
        : "neutral";

  return (
    <Surface id="ajuste-coach" variant="accent" padded="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="heading-section text-xl text-ink">
          Análisis y propuesta de ajuste del Coach
        </h2>
        <Badge tone={statusTone}>
          {ADJUSTMENT_STATUS_LABELS[latestCheckIn.adjustment_status]}
        </Badge>
      </div>

      {latestCheckIn.weight_trend && (
        <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="rounded-control border border-line bg-surface p-3 text-xs">
            <dt className="text-ink-muted">Tendencia real</dt>
            <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">
              {latestCheckIn.weight_trend.actual_weekly_change_kg !== null
                ? `${latestCheckIn.weight_trend.actual_weekly_change_kg > 0 ? "+" : ""}${latestCheckIn.weight_trend.actual_weekly_change_kg} kg/sem`
                : "Primer registro"}
            </dd>
          </div>
          <div className="rounded-control border border-line bg-surface p-3 text-xs">
            <dt className="text-ink-muted">Estado</dt>
            <dd className="mt-1 text-sm font-semibold text-accent-text">
              {TREND_STATUS_LABELS[latestCheckIn.weight_trend.trend_status] ??
                latestCheckIn.weight_trend.trend_status}
            </dd>
          </div>
          <div className="rounded-control border border-line bg-surface p-3 text-xs">
            <dt className="text-ink-muted">Delta TDEE estimado</dt>
            <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">
              {latestCheckIn.estimated_tdee_delta_kcal !== null
                ? `${latestCheckIn.estimated_tdee_delta_kcal > 0 ? "+" : ""}${latestCheckIn.estimated_tdee_delta_kcal} kcal/día`
                : "N/D"}
            </dd>
          </div>
        </dl>
      )}

      <p className="text-sm leading-relaxed text-ink">
        {latestCheckIn.coach_recommendations.summary_es}
      </p>

      {latestCheckIn.coach_recommendations.training_adjustment_es && (
        <div className="rounded-control border border-warning/35 bg-warning-soft/80 p-3 text-xs text-warning-text">
          <p className="font-semibold">Ajuste de entrenamiento sugerido:</p>
          <p className="mt-1 leading-relaxed">
            {latestCheckIn.coach_recommendations.training_adjustment_es}
          </p>
        </div>
      )}

      {latestCheckIn.coach_recommendations.proposed_target_calories !== null &&
        latestCheckIn.coach_recommendations.calorie_delta_kcal !== 0 && (
          <div className="rounded-control border border-line bg-surface p-3.5 text-xs text-ink-muted">
            <p className="text-sm font-semibold text-ink tabular-nums">
              Objetivos propuestos:{" "}
              {latestCheckIn.coach_recommendations.proposed_target_calories} kcal (
              {latestCheckIn.coach_recommendations.calorie_delta_kcal > 0 ? "+" : ""}
              {latestCheckIn.coach_recommendations.calorie_delta_kcal} kcal)
            </p>
            <p className="mt-1 tabular-nums">
              Proteína {latestCheckIn.coach_recommendations.proposed_protein_g} g · Grasas{" "}
              {latestCheckIn.coach_recommendations.proposed_fat_g} g · Carbohidratos{" "}
              {latestCheckIn.coach_recommendations.proposed_carbs_g} g
            </p>
          </div>
        )}

      {latestCheckIn.adjustment_status === "proposed" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            disabled={resolvingAdjustmentId === latestCheckIn.id}
            onClick={() => onApply(latestCheckIn.id)}
          >
            Aplicar ajuste
          </Button>
          <Button
            variant="secondary"
            disabled={resolvingAdjustmentId === latestCheckIn.id}
            onClick={() => onDismiss(latestCheckIn.id)}
          >
            Descartar
          </Button>
        </div>
      )}
    </Surface>
  );
}
