import { CalendarDays, CheckCircle2, ClipboardList } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import {
  statusBadgeLabel,
  statusBadgeTone,
  type TodaySessionResponse,
} from "./types";

interface TodaySessionTabProps {
  todayData: TodaySessionResponse | null;
  onSelectPlannedSession: (plannedSessionId: string) => void;
  onStartLogging: () => void;
  onGoToMesocycles: () => void;
}

export function TodaySessionTab({
  todayData,
  onSelectPlannedSession,
  onStartLogging,
  onGoToMesocycles,
}: TodaySessionTabProps) {
  if (!todayData?.active_mesocycle) {
    return (
      <Surface variant="inset" padded="lg" className="text-center">
        <p className="heading-section text-lg text-ink">
          No tienes ningún Mesociclo activo.
        </p>
        <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-ink-muted">
          Genera un borrador personalizado con el Coach o activa uno existente en la pestaña
          Mesociclos.
        </p>
        <div className="mt-4">
          <Button onClick={onGoToMesocycles}>Ir a Mesociclos</Button>
        </div>
      </Surface>
    );
  }

  const meso = todayData.active_mesocycle;

  return (
    <div className="space-y-5">
      <Surface variant="classical" padded="md" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={statusBadgeTone(meso.status)}>
                {statusBadgeLabel(meso.status)}
              </Badge>
              <span className="text-xs text-ink-muted tabular-nums">
                {meso.duration_weeks} semanas · {todayData.completed_sessions_in_mesocycle} sesiones
                completadas
              </span>
            </div>
            <h2 className="heading-section text-xl text-ink">{meso.name}</h2>
            <p className="text-xs text-ink-muted">{meso.goal}</p>
          </div>
          <Button onClick={onStartLogging}>
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            <span>Registrar esta sesión</span>
          </Button>
        </div>

        {meso.planned_sessions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <CalendarDays className="h-4 w-4 text-ink-subtle" aria-hidden="true" />
            {meso.planned_sessions.map((ps) => {
              const isSelected = todayData.planned_session?.id === ps.id;
              return (
                <button
                  key={ps.id}
                  type="button"
                  onClick={() => onSelectPlannedSession(ps.id)}
                  className={`rounded-control border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isSelected
                      ? "border-accent bg-accent-soft text-accent-text"
                      : "border-line bg-surface-muted/60 text-ink-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  Día {ps.day_order}: {ps.name}
                </button>
              );
            })}
          </div>
        )}
      </Surface>

      {todayData.planned_session && (
        <div className="space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="heading-section text-lg text-ink">
              Sesión planificada: {todayData.planned_session.name}
            </h3>
            <span className="text-xs text-ink-muted tabular-nums">
              {todayData.exercises.length} ejercicios
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
            {todayData.exercises.map((item) => (
              <article
                key={item.planned.exercise_name}
                className="flex flex-col justify-between space-y-3 rounded-panel border border-line bg-surface p-4 shadow-panel"
              >
                <div className="space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-semibold text-ink">
                      {item.planned.exercise_name}
                    </h4>
                    <Badge tone="neutral" className="capitalize">
                      {item.planned.primary_muscle_group}
                    </Badge>
                  </div>
                  <p className="text-xs font-medium text-ink-muted tabular-nums">
                    {item.planned.target_sets} series · {item.planned.rep_range_min}–
                    {item.planned.rep_range_max} reps
                    {item.planned.target_rir !== null && item.planned.target_rir !== undefined
                      ? ` · RIR ${item.planned.target_rir}`
                      : ""}
                  </p>
                </div>

                <div className="rounded-control border border-line bg-surface-muted/60 px-3 py-2.5 text-xs">
                  {item.previous_mark ? (
                    <div className="space-y-1">
                      <p className="flex items-center gap-1.5 font-semibold text-secondary-text tabular-nums">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          Marca previa ({item.previous_mark.last_session_date}): mejor{" "}
                          {item.previous_mark.best_load} {item.previous_mark.best_unit} ×{" "}
                          {item.previous_mark.best_reps}
                          {item.previous_mark.best_rir !== null &&
                          item.previous_mark.best_rir !== undefined
                            ? ` @ RIR ${item.previous_mark.best_rir}`
                            : ""}
                        </span>
                      </p>
                      <p className="text-ink-muted tabular-nums">
                        Última sesión:{" "}
                        {item.previous_mark.last_sets
                          .map(
                            (s) =>
                              `${s.load}${s.unit}×${s.reps}${
                                s.rir !== null && s.rir !== undefined ? ` (RIR ${s.rir})` : ""
                              }`,
                          )
                          .join(" · ")}
                      </p>
                    </div>
                  ) : (
                    <p className="text-ink-subtle">
                      Sin marcas previas registradas para este ejercicio.
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
