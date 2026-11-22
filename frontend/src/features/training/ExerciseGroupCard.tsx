import { Check, Copy, Plus, Trash2 } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input, Select } from "../../ui/Field";
import { HelpTip } from "../../ui/HelpTip";
import { IconButton } from "../../ui/IconButton";
import { adjustLoadValue, createDefaultExerciseSet } from "./sessionDraft";
import type { EditableExerciseGroup, EditableExerciseSet } from "./types";

interface ExerciseGroupCardProps {
  group: EditableExerciseGroup;
  groupIndex: number;
  canRemoveGroup: boolean;
  onChange: (updated: EditableExerciseGroup) => void;
  onRemoveGroup: () => void;
}

export function ExerciseGroupCard({
  group,
  groupIndex,
  canRemoveGroup,
  onChange,
  onRemoveGroup,
}: ExerciseGroupCardProps) {
  const stepDelta = group.unit === "lb" ? 5 : 2.5;
  const completedCount = group.sets.filter((s) => s.completed).length;
  const groupLabel = group.exercise_name.trim() || `Bloque ${groupIndex + 1}`;

  function updateSet(setIndex: number, patch: Partial<EditableExerciseSet>) {
    onChange({
      ...group,
      sets: group.sets.map((s, idx) => (idx === setIndex ? { ...s, ...patch } : s)),
    });
  }

  function addSet() {
    const last = group.sets[group.sets.length - 1];
    const next = createDefaultExerciseSet({
      reps: last?.reps ?? "8",
      load: group.isBodyweight ? "" : (last?.load ?? ""),
      rir: last?.rir ?? "2",
      rpe: "",
      completed: false,
    });
    onChange({ ...group, sets: [...group.sets, next] });
  }

  function duplicateLastSet() {
    const last = group.sets[group.sets.length - 1];
    if (!last) {
      addSet();
      return;
    }
    const copy = createDefaultExerciseSet({
      reps: last.reps,
      load: last.load,
      rir: last.rir,
      rpe: last.rpe,
      completed: false,
    });
    onChange({ ...group, sets: [...group.sets, copy] });
  }

  function removeSet(setIndex: number) {
    if (group.sets.length <= 1) return;
    onChange({
      ...group,
      sets: group.sets.filter((_, idx) => idx !== setIndex),
    });
  }

  return (
    <section
      role="group"
      aria-label={groupLabel}
      className="rounded-panel border border-line bg-surface"
    >
      {/* Sticky exercise header: prescription & previous mark stay visible across all sets */}
      <div className="sticky top-16 z-10 space-y-2.5 rounded-t-panel border-b border-line bg-surface/95 px-3.5 py-3 backdrop-blur-sm sm:top-14">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid min-w-0 flex-1 grid-cols-1 gap-2 sm:grid-cols-12">
            <label className="block space-y-1 text-xs font-medium text-ink-muted sm:col-span-5">
              <span>Ejercicio</span>
              <Input
                compact
                type="text"
                value={group.exercise_name}
                onChange={(e) => onChange({ ...group, exercise_name: e.target.value })}
                placeholder="Ej. Press inclinado mancuernas"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-ink-muted sm:col-span-3">
              <span>Grupo muscular</span>
              <Input
                compact
                type="text"
                value={group.muscle_group}
                onChange={(e) => onChange({ ...group, muscle_group: e.target.value })}
                placeholder="Ej. pecho"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-ink-muted sm:col-span-4">
              <span>Músculos secundarios</span>
              <Input
                compact
                type="text"
                value={group.secondary_muscle_groups}
                onChange={(e) =>
                  onChange({ ...group, secondary_muscle_groups: e.target.value })
                }
                placeholder="Ej. hombros, triceps"
              />
            </label>
          </div>

          {canRemoveGroup && (
            <IconButton
              tone="danger"
              onClick={onRemoveGroup}
              aria-label={`Quitar ejercicio ${groupLabel}`}
              title="Quitar ejercicio"
              className="mt-5 shrink-0"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
              <span className="sr-only">Unidad de peso</span>
              <Select
                compact
                aria-label="Unidad"
                value={group.unit}
                onChange={(e) =>
                  onChange({ ...group, unit: e.target.value === "lb" ? "lb" : "kg" })
                }
                className="min-h-[44px] w-[4.5rem] px-2 sm:min-h-[36px]"
              >
                <option value="kg">kg</option>
                <option value="lb">lb</option>
              </Select>
            </label>

            <Button
              variant={group.isBodyweight ? "soft" : "secondary"}
              size="sm"
              aria-pressed={group.isBodyweight}
              onClick={() =>
                onChange({
                  ...group,
                  isBodyweight: !group.isBodyweight,
                })
              }
            >
              <span>Peso corporal</span>
            </Button>
          </div>

          <Badge tone={completedCount === group.sets.length ? "success" : "neutral"}>
            <span className="tabular-nums">
              {completedCount}/{group.sets.length} completadas
            </span>
          </Badge>
        </div>

        <HelpTip term="RIR" triggerLabel="¿Qué es RIR?" title="Repeticiones en recámara (RIR)">
          Estima cuántas repeticiones válidas podrías haber completado antes del fallo muscular
          (RIR 0 = fallo; RIR 1–2 = zona habitual de estímulo efectivo en hipertrofia).
        </HelpTip>

        {(group.targetHint || group.previousMarkHint) && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-accent/25 bg-accent-soft/45 px-3 py-2 text-xs">
            {group.targetHint && (
              <span className="font-semibold text-accent-text tabular-nums">
                Objetivo: {group.targetHint}
              </span>
            )}
            {group.previousMarkHint && (
              <span className="text-secondary-text tabular-nums">{group.previousMarkHint}</span>
            )}
          </div>
        )}
      </div>

      {/* Compact set rows */}
      <div className="divide-y divide-line">
        {group.sets.map((set, setIdx) => {
          const setNum = setIdx + 1;
          return (
            <div
              key={set.id}
              className={`px-3.5 py-3 transition-colors ${
                set.completed ? "bg-success-soft/25" : "bg-surface"
              }`}
            >
              <div className="flex flex-wrap items-end gap-2">
                {/* Completion toggle & set index */}
                <div className="flex items-center gap-1.5 pb-0.5">
                  <Button
                    variant={set.completed ? "soft" : "secondary"}
                    size="sm"
                    aria-pressed={set.completed}
                    aria-label={`Marcar serie ${setNum} completada`}
                    onClick={() => updateSet(setIdx, { completed: !set.completed })}
                    className={`min-h-[44px] min-w-[44px] px-2 sm:min-h-[36px] sm:min-w-[36px] ${
                      set.completed
                        ? "border-success/45 bg-success-soft text-success-text hover:bg-success/20"
                        : ""
                    }`}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <span className="w-7 text-xs font-semibold text-ink-muted tabular-nums">
                    S{setNum}
                  </span>
                </div>

                {/* Load input with ±2.5 kg / ±5 lb touch steppers */}
                <div className="min-w-[13.5rem] flex-1 space-y-1">
                  <label
                    htmlFor={`load-${set.id}`}
                    className="block text-xs font-medium text-ink-muted"
                  >
                    Carga ({group.unit})
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Restar ${stepDelta} ${group.unit} en serie ${setNum}`}
                      onClick={() =>
                        updateSet(setIdx, { load: adjustLoadValue(set.load, -stepDelta) })
                      }
                      className="min-h-[44px] min-w-[44px] shrink-0 px-2 tabular-nums sm:min-h-[36px] sm:min-w-[44px]"
                    >
                      -{stepDelta}
                    </Button>
                    <Input
                      id={`load-${set.id}`}
                      compact
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min={0}
                      placeholder={group.isBodyweight ? "0 (PC)" : "Peso"}
                      value={set.load}
                      onChange={(e) => updateSet(setIdx, { load: e.target.value })}
                      className="min-h-[44px] min-w-0 flex-1 text-center tabular-nums sm:min-h-[36px]"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Sumar ${stepDelta} ${group.unit} en serie ${setNum}`}
                      onClick={() =>
                        updateSet(setIdx, { load: adjustLoadValue(set.load, stepDelta) })
                      }
                      className="min-h-[44px] min-w-[44px] shrink-0 px-2 tabular-nums sm:min-h-[36px] sm:min-w-[44px]"
                    >
                      +{stepDelta}
                    </Button>
                  </div>
                </div>

                {/* Reps */}
                <label className="block w-20 space-y-1 text-xs font-medium text-ink-muted">
                  <span>Repeticiones</span>
                  <Input
                    compact
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={200}
                    value={set.reps}
                    onChange={(e) => updateSet(setIdx, { reps: e.target.value })}
                    className="min-h-[44px] text-center tabular-nums sm:min-h-[36px]"
                  />
                </label>

                {/* RIR */}
                <label className="block w-16 space-y-1 text-xs font-medium text-ink-muted">
                  <span>RIR</span>
                  <Input
                    compact
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    min={0}
                    max={10}
                    value={set.rir}
                    onChange={(e) => updateSet(setIdx, { rir: e.target.value })}
                    className="min-h-[44px] text-center tabular-nums sm:min-h-[36px]"
                  />
                </label>

                {group.sets.length > 1 && (
                  <IconButton
                    tone="danger"
                    onClick={() => removeSet(setIdx)}
                    aria-label={`Quitar serie ${setNum}`}
                    title="Quitar serie"
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </IconButton>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Group footer actions */}
      <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-muted/40 px-3.5 py-2.5">
        <Button variant="secondary" size="sm" onClick={addSet}>
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Añadir serie</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={duplicateLastSet}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Duplicar última serie</span>
        </Button>
      </div>
    </section>
  );
}
