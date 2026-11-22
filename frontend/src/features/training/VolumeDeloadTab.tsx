import { Badge } from "../../ui/Badge";
import { MetricBar } from "../../ui/MetricBar";
import { Surface } from "../../ui/Surface";
import { ExerciseE1rmChart } from "./ExerciseE1rmChart";
import type { TrainingSessionResponse, WeeklyVolumeSummaryResponse } from "./types";
import { VolumeTrendChart } from "./VolumeTrendChart";

interface VolumeDeloadTabProps {
  volumeSummary: WeeklyVolumeSummaryResponse | null;
  sessions?: TrainingSessionResponse[];
}

export function VolumeDeloadTab({ volumeSummary, sessions = [] }: VolumeDeloadTabProps) {
  if (!volumeSummary) return null;

  const { deload_assessment } = volumeSummary;
  const maxReference = Math.max(
    12,
    ...volumeSummary.by_muscle_group.map((m) => Math.max(m.effective_sets, m.planned_sets || 0)),
  );

  return (
    <div className="space-y-5">
      <Surface
        variant={deload_assessment.recommended ? "warning" : "focal"}
        padded="md"
        className="space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="heading-section text-lg text-ink">Evaluación de Descarga</h2>
          <Badge
            tone={
              deload_assessment.recommended
                ? "warning"
                : deload_assessment.status === "watch"
                  ? "secondary"
                  : "success"
            }
          >
            {deload_assessment.recommended
              ? "Descarga recomendada"
              : deload_assessment.status === "watch"
                ? "Vigilar fatiga"
                : "Sin necesidad de descarga"}
          </Badge>
        </div>

        {deload_assessment.reasons_es.length > 0 ? (
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink">
            {deload_assessment.reasons_es.map((reason, idx) => (
              <li key={idx}>{reason}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-muted">
            Rendimiento y fatiga dentro de rangos sostenibles.
          </p>
        )}
      </Surface>

      <Surface variant="default" padded="md" className="space-y-4">
        <div className="space-y-1">
          <h3 className="heading-section text-lg text-ink">
            Volumen semanal efectivo ({volumeSummary.week_start} a {volumeSummary.week_end})
          </h3>
          <p className="text-xs text-ink-muted tabular-nums">
            {volumeSummary.total_sessions} sesiones · {volumeSummary.total_effective_sets} series
            efectivas totales (directas = 1.0, secundarias = 0.5; RIR = repeticiones en reserva)
          </p>
        </div>

        {volumeSummary.by_muscle_group.length === 0 ? (
          <p className="text-xs text-ink-muted">
            Registra Sesiones de Entrenamiento esta semana para ver el desglose por grupo muscular.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {volumeSummary.by_muscle_group.map((mg) => {
              const target = mg.planned_sets > 0 ? mg.planned_sets : maxReference;
              const isOverTarget = mg.planned_sets > 0 && mg.effective_sets > mg.planned_sets * 1.15;
              return (
                <div
                  key={mg.muscle_group}
                  className="space-y-2 rounded-panel border border-line bg-surface-muted/50 p-3.5 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold capitalize text-ink">
                        {mg.muscle_group}
                      </p>
                      <p className="text-ink-muted tabular-nums">
                        Directas: {mg.direct_sets} · Secundarias: {mg.secondary_sets}
                        {mg.average_rir !== null && mg.average_rir !== undefined
                          ? ` · RIR medio: ${mg.average_rir}`
                          : ""}
                      </p>
                    </div>
                    <div className="text-right tabular-nums">
                      <p className="text-sm font-bold text-accent-text">
                        {mg.effective_sets} efectivas
                      </p>
                      {mg.planned_sets > 0 && (
                        <p className="text-xs text-ink-muted">Objetivo: {mg.planned_sets}</p>
                      )}
                    </div>
                  </div>
                  <MetricBar
                    value={mg.effective_sets}
                    max={target}
                    tone={isOverTarget ? "warning" : "accent"}
                    ariaLabel={`Volumen efectivo de ${mg.muscle_group}: ${mg.effective_sets} de ${target} series`}
                  />
                </div>
              );
            })}
          </div>
        )}
      </Surface>

      <VolumeTrendChart sessions={sessions} />

      <ExerciseE1rmChart sessions={sessions} />
    </div>
  );
}
