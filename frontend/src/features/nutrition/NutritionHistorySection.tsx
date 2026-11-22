import { Surface } from "../../ui/Surface";
import {
  PHASE_TYPE_LABELS,
  type NutritionPhaseResponse,
  type WeeklyCheckInResponse,
} from "./labels";

interface NutritionHistorySectionProps {
  checkins: WeeklyCheckInResponse[];
  completedPhases: NutritionPhaseResponse[];
}

export function NutritionHistorySection({
  checkins,
  completedPhases,
}: NutritionHistorySectionProps) {
  return (
    <div id="historial-nutricion" className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <Surface variant="default" padded="md" className="space-y-3">
        <h2 className="heading-section text-lg text-ink">Historial de Check-ins</h2>
        {checkins.length === 0 ? (
          <p className="text-xs text-ink-muted">Todavía no has registrado ningún Check-in.</p>
        ) : (
          <ul className="space-y-2.5">
            {checkins.map((item) => (
              <li
                key={item.id}
                className="rounded-control border border-line bg-surface-muted/50 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink tabular-nums">
                    {item.checkin_date} · {item.average_weight_kg} kg
                  </span>
                  <span className="text-ink-muted tabular-nums">
                    Adherencia {item.adherence_score}/10 · Fatiga {item.perceived_fatigue}/10
                  </span>
                </div>
                {item.performance_notes && (
                  <p className="mt-1.5 leading-relaxed text-ink-muted">{item.performance_notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Surface>

      <Surface variant="default" padded="md" className="space-y-3">
        <h2 className="heading-section text-lg text-ink">Historial de Fases Nutricionales</h2>
        {completedPhases.length === 0 ? (
          <p className="text-xs text-ink-muted">No hay Fases Nutricionales finalizadas aún.</p>
        ) : (
          <ul className="space-y-2.5">
            {completedPhases.map((phase) => (
              <li
                key={phase.id}
                className="rounded-control border border-line bg-surface-muted/50 p-3 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink tabular-nums">
                    {PHASE_TYPE_LABELS[phase.phase_type]} · {phase.target_calories} kcal
                  </span>
                  <span className="text-ink-muted tabular-nums">
                    {phase.start_date} a {phase.end_date ?? "—"}
                  </span>
                </div>
                <p className="mt-1.5 text-ink-muted tabular-nums">
                  P {phase.protein_g} g · G {phase.fat_g} g · HC {phase.carbs_g} g · Ritmo{" "}
                  {phase.target_weekly_weight_change_kg > 0 ? "+" : ""}
                  {phase.target_weekly_weight_change_kg} kg/sem
                </p>
              </li>
            ))}
          </ul>
        )}
      </Surface>
    </div>
  );
}
