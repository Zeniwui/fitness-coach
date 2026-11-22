import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { HelpTip } from "../../ui/HelpTip";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import type { EditablePlannedSession, PlannedExerciseSchema } from "./types";

interface MesocycleEditorProps {
  name: string;
  goal: string;
  weeks: string;
  plannedSessions: EditablePlannedSession[];
  onNameChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onWeeksChange: (value: string) => void;
  onPlannedSessionsChange: (sessions: EditablePlannedSession[]) => void;
  onSave: (e: FormEvent) => void;
  onCancel: () => void;
}

function createDefaultPlannedExercise(): PlannedExerciseSchema {
  return {
    exercise_name: "",
    primary_muscle_group: "hombros",
    secondary_muscle_groups: [],
    target_sets: 3,
    rep_range_min: 8,
    rep_range_max: 12,
    target_rir: 2,
    target_rpe: null,
    notes: null,
  };
}

export function MesocycleEditor({
  name,
  goal,
  weeks,
  plannedSessions,
  onNameChange,
  onGoalChange,
  onWeeksChange,
  onPlannedSessionsChange,
  onSave,
  onCancel,
}: MesocycleEditorProps) {
  function updateDay(dayIdx: number, updater: (day: EditablePlannedSession) => EditablePlannedSession) {
    onPlannedSessionsChange(
      plannedSessions.map((day, idx) => (idx === dayIdx ? updater(day) : day)),
    );
  }

  function addDay() {
    const nextOrder = plannedSessions.length + 1;
    onPlannedSessionsChange([
      ...plannedSessions,
      {
        day_order: nextOrder,
        name: `Día ${nextOrder}`,
        exercises: [createDefaultPlannedExercise()],
      },
    ]);
  }

  function removeDay(dayIdx: number) {
    if (plannedSessions.length <= 1) return;
    const remaining = plannedSessions
      .filter((_, idx) => idx !== dayIdx)
      .map((day, idx) => ({ ...day, day_order: idx + 1 }));
    onPlannedSessionsChange(remaining);
  }

  function updateExercise(
    dayIdx: number,
    exIdx: number,
    patch: Partial<PlannedExerciseSchema>,
  ) {
    updateDay(dayIdx, (day) => ({
      ...day,
      exercises: day.exercises.map((ex, idx) => (idx === exIdx ? { ...ex, ...patch } : ex)),
    }));
  }

  function addExercise(dayIdx: number) {
    updateDay(dayIdx, (day) => ({
      ...day,
      exercises: [...day.exercises, createDefaultPlannedExercise()],
    }));
  }

  function removeExercise(dayIdx: number, exIdx: number) {
    updateDay(dayIdx, (day) => {
      if (day.exercises.length <= 1) return day;
      return {
        ...day,
        exercises: day.exercises.filter((_, idx) => idx !== exIdx),
      };
    });
  }

  return (
    <Surface variant="accent" padded="md">
      <form onSubmit={onSave} className="space-y-5">
        <div className="space-y-0.5">
          <h3 className="heading-section text-base text-accent-text">Editar Mesociclo</h3>
          <p className="text-xs text-ink-muted">
            Ajusta los metadatos, los días planificados y los ejercicios sin regenerar el bloque.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Nombre del Mesociclo</span>
            <Input
              type="text"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Objetivo</span>
            <Input
              type="text"
              value={goal}
              onChange={(e) => onGoalChange(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Duración (semanas)</span>
            <Input
              type="number"
              min={2}
              max={16}
              value={weeks}
              onChange={(e) => onWeeksChange(e.target.value)}
              required
              className="tabular-nums"
            />
          </label>
        </div>

        <div className="space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="heading-section text-sm text-ink">Días y ejercicios planificados</h4>
            <Button variant="secondary" size="sm" onClick={addDay}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Añadir día</span>
            </Button>
          </div>
          <HelpTip
            term="RIR"
            triggerLabel="¿Qué es RIR objetivo?"
            title="Repeticiones en recámara (RIR)"
          >
            Marca la proximidad al fallo objetivo de cada ejercicio del Mesociclo: RIR 1–2 suele
            equilibrar estímulo de hipertrofia y fatiga acumulable antes de la descarga.
          </HelpTip>

          {plannedSessions.map((day, dayIdx) => {
            const dayGroupLabel = `Día ${day.day_order}: ${day.name.trim() || "Sin nombre"}`;
            return (
              <section
                key={`day-${day.day_order}-${dayIdx}`}
                role="group"
                aria-label={dayGroupLabel}
                className="rounded-panel border border-line bg-surface"
              >
                <div className="flex flex-wrap items-end justify-between gap-2 border-b border-line bg-surface-muted/45 px-3.5 py-2.5">
                  <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2.5">
                    <Badge tone="neutral" className="mb-1.5 shrink-0 tabular-nums">
                      Día {day.day_order}
                    </Badge>
                    <label className="block min-w-[12rem] flex-1 space-y-1 text-xs font-medium text-ink-muted">
                      <span>Nombre del día</span>
                      <Input
                        compact
                        type="text"
                        value={day.name}
                        onChange={(e) => updateDay(dayIdx, (d) => ({ ...d, name: e.target.value }))}
                        required
                      />
                    </label>
                  </div>

                  {plannedSessions.length > 1 && (
                    <IconButton
                      tone="danger"
                      onClick={() => removeDay(dayIdx)}
                      aria-label={`Quitar ${dayGroupLabel}`}
                      title="Quitar día"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </IconButton>
                  )}
                </div>

                <div className="divide-y divide-line">
                  {day.exercises.map((ex, exIdx) => (
                    <div key={`ex-${dayIdx}-${exIdx}`} className="space-y-2.5 px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-12">
                          <label className="block space-y-1 text-xs font-medium text-ink-muted sm:col-span-5">
                            <span>Ejercicio</span>
                            <Input
                              compact
                              type="text"
                              value={ex.exercise_name}
                              onChange={(e) =>
                                updateExercise(dayIdx, exIdx, { exercise_name: e.target.value })
                              }
                              placeholder="Ej. Press inclinado mancuernas"
                              required
                            />
                          </label>
                          <label className="block space-y-1 text-xs font-medium text-ink-muted sm:col-span-3">
                            <span>Grupo muscular</span>
                            <Input
                              compact
                              type="text"
                              value={ex.primary_muscle_group}
                              onChange={(e) =>
                                updateExercise(dayIdx, exIdx, {
                                  primary_muscle_group: e.target.value,
                                })
                              }
                              required
                            />
                          </label>
                          <label className="block space-y-1 text-xs font-medium text-ink-muted sm:col-span-4">
                            <span>Músculos secundarios</span>
                            <Input
                              compact
                              type="text"
                              value={(ex.secondary_muscle_groups ?? []).join(", ")}
                              onChange={(e) =>
                                updateExercise(dayIdx, exIdx, {
                                  secondary_muscle_groups: e.target.value
                                    .split(",")
                                    .map((s) => s.trim())
                                    .filter(Boolean),
                                })
                              }
                              placeholder="Ej. hombros, triceps"
                            />
                          </label>
                        </div>

                        {day.exercises.length > 1 && (
                          <IconButton
                            tone="danger"
                            onClick={() => removeExercise(dayIdx, exIdx)}
                            aria-label={`Quitar ejercicio ${ex.exercise_name.trim() || exIdx + 1}`}
                            title="Quitar ejercicio"
                            className="mt-5 shrink-0"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </IconButton>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <label className="block space-y-1 text-xs font-medium text-ink-muted">
                          <span>Series objetivo</span>
                          <Input
                            compact
                            type="number"
                            min={1}
                            max={20}
                            value={ex.target_sets ?? 3}
                            onChange={(e) =>
                              updateExercise(dayIdx, exIdx, {
                                target_sets: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="tabular-nums"
                          />
                        </label>
                        <label className="block space-y-1 text-xs font-medium text-ink-muted">
                          <span>Reps mín.</span>
                          <Input
                            compact
                            type="number"
                            min={1}
                            max={100}
                            value={ex.rep_range_min ?? 8}
                            onChange={(e) =>
                              updateExercise(dayIdx, exIdx, {
                                rep_range_min: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="tabular-nums"
                          />
                        </label>
                        <label className="block space-y-1 text-xs font-medium text-ink-muted">
                          <span>Reps máx.</span>
                          <Input
                            compact
                            type="number"
                            min={1}
                            max={100}
                            value={ex.rep_range_max ?? 12}
                            onChange={(e) =>
                              updateExercise(dayIdx, exIdx, {
                                rep_range_max: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="tabular-nums"
                          />
                        </label>
                        <label className="block space-y-1 text-xs font-medium text-ink-muted">
                          <span>RIR objetivo</span>
                          <Input
                            compact
                            type="number"
                            step="0.5"
                            min={0}
                            max={10}
                            value={ex.target_rir ?? ""}
                            onChange={(e) =>
                              updateExercise(dayIdx, exIdx, {
                                target_rir:
                                  e.target.value.trim() === "" ? null : Number(e.target.value),
                              })
                            }
                            className="tabular-nums"
                          />
                        </label>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-line bg-surface-muted/35 px-3.5 py-2.5">
                  <Button variant="secondary" size="sm" onClick={() => addExercise(dayIdx)}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Añadir ejercicio</span>
                  </Button>
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm">
            Guardar cambios
          </Button>
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Surface>
  );
}
