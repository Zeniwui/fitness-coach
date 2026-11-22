import type { FormEvent } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input, Select, Textarea } from "../../ui/Field";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import { NaturalSessionLogger } from "../multimodal/NaturalSessionLogger";
import {
  defaultSetRow,
  type EditableSetRow,
  type TrainingSessionResponse,
} from "./types";

interface SessionsTabProps {
  activeMesocycleId: string | null;
  startedFromToday?: boolean;
  sessions: TrainingSessionResponse[];
  editingSessionId: string | null;
  sessionName: string;
  sessionDate: string;
  fatigueNotes: string;
  setRows: EditableSetRow[];
  onSessionNameChange: (v: string) => void;
  onSessionDateChange: (v: string) => void;
  onFatigueNotesChange: (v: string) => void;
  onSetRowsChange: (rows: EditableSetRow[]) => void;
  onCancelEdit: () => void;
  onSaveSession: (e: FormEvent) => void;
  onEditSession: (session: TrainingSessionResponse) => void;
  onDeleteSession: (sessionId: string) => void;
  onNaturalSessionSaved: () => Promise<void>;
}

export function SessionsTab({
  activeMesocycleId,
  startedFromToday = false,
  sessions,
  editingSessionId,
  sessionName,
  sessionDate,
  fatigueNotes,
  setRows,
  onSessionNameChange,
  onSessionDateChange,
  onFatigueNotesChange,
  onSetRowsChange,
  onCancelEdit,
  onSaveSession,
  onEditSession,
  onDeleteSession,
  onNaturalSessionSaved,
}: SessionsTabProps) {
  function updateRow(idx: number, patch: Partial<EditableSetRow>) {
    onSetRowsChange(setRows.map((row, i) => (i === idx ? { ...row, ...patch } : row)));
  }

  function duplicateRow(idx: number) {
    const source = setRows[idx];
    if (!source) return;
    const copy: EditableSetRow = {
      ...source,
      targetHint: undefined,
      previousMarkHint: undefined,
    };
    const next = [...setRows];
    next.splice(idx + 1, 0, copy);
    onSetRowsChange(next);
  }

  function removeRow(idx: number) {
    if (setRows.length <= 1) return;
    onSetRowsChange(setRows.filter((_, i) => i !== idx));
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Voice/NL logger + Manual quick gym log */}
      <div className="space-y-5 lg:col-span-7">
        <NaturalSessionLogger
          activeMesocycleId={activeMesocycleId}
          defaultCollapsed={startedFromToday}
          onSessionSaved={onNaturalSessionSaved}
        />

        <Surface variant="focal" padded="md">
          <form onSubmit={onSaveSession} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="space-y-0.5">
                <h2 className="heading-section text-lg text-ink">
                  {editingSessionId
                    ? "Editar Sesión de Entrenamiento"
                    : "Registro rápido de Sesión de Entrenamiento"}
                </h2>
                <p className="text-xs text-ink-muted">
                  Tu borrador se guarda localmente mientras entrenas para no perder series.
                </p>
              </div>
              {editingSessionId && (
                <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                  Cancelar edición
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Nombre de la sesión</span>
                <Input
                  type="text"
                  value={sessionName}
                  onChange={(e) => onSessionNameChange(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Fecha</span>
                <Input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => onSessionDateChange(e.target.value)}
                  required
                />
              </label>
            </div>

            <div className="space-y-3">
              {setRows.map((row, idx) => (
                <div
                  key={idx}
                  className="space-y-2.5 rounded-panel border border-line bg-surface-muted/50 p-3.5"
                >
                  {(row.targetHint || row.previousMarkHint) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-accent/25 bg-accent-soft/45 px-3 py-2 text-xs">
                      {row.targetHint && (
                        <span className="font-semibold text-accent-text tabular-nums">
                          Objetivo: {row.targetHint}
                        </span>
                      )}
                      {row.previousMarkHint && (
                        <span className="text-secondary-text tabular-nums">
                          {row.previousMarkHint}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink tabular-nums">
                      Serie {idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <IconButton
                        onClick={() => duplicateRow(idx)}
                        aria-label={`Duplicar serie ${idx + 1}`}
                        title="Duplicar serie"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="hidden sm:inline">Duplicar</span>
                      </IconButton>
                      {setRows.length > 1 && (
                        <IconButton
                          tone="danger"
                          onClick={() => removeRow(idx)}
                          aria-label={`Quitar serie ${idx + 1}`}
                          title="Quitar serie"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </IconButton>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-6">
                    <label className="col-span-2 block space-y-1 text-xs text-ink-muted">
                      <span>Ejercicio</span>
                      <Input
                        compact
                        type="text"
                        value={row.exercise_name}
                        onChange={(e) => updateRow(idx, { exercise_name: e.target.value })}
                        placeholder="Ej. Press inclinado"
                      />
                    </label>
                    <label className="col-span-2 block space-y-1 text-xs text-ink-muted sm:col-span-1">
                      <span>Músculo</span>
                      <Input
                        compact
                        type="text"
                        value={row.muscle_group}
                        onChange={(e) => updateRow(idx, { muscle_group: e.target.value })}
                      />
                    </label>
                    <label className="col-span-2 block space-y-1 text-xs text-ink-muted sm:col-span-2">
                      <span>Carga ({row.unit})</span>
                      <div className="flex gap-1.5">
                        <Input
                          compact
                          type="number"
                          step="0.5"
                          min={0}
                          placeholder="0"
                          value={row.load}
                          onChange={(e) => updateRow(idx, { load: e.target.value })}
                          className="min-w-0 flex-1 tabular-nums"
                        />
                        <Select
                          compact
                          aria-label={`Unidad serie ${idx + 1}`}
                          value={row.unit}
                          onChange={(e) =>
                            updateRow(idx, { unit: e.target.value === "lb" ? "lb" : "kg" })
                          }
                          className="w-[4.25rem] shrink-0 px-2"
                        >
                          <option value="kg">kg</option>
                          <option value="lb">lb</option>
                        </Select>
                      </div>
                    </label>
                    <label className="block space-y-1 text-xs text-ink-muted sm:col-span-1">
                      <span>Repeticiones</span>
                      <Input
                        compact
                        type="number"
                        min={1}
                        value={row.reps}
                        onChange={(e) => updateRow(idx, { reps: e.target.value })}
                        className="tabular-nums"
                      />
                    </label>
                    <label className="block space-y-1 text-xs text-ink-muted sm:col-span-1">
                      <span>RIR</span>
                      <Input
                        compact
                        type="number"
                        step="0.5"
                        min={0}
                        max={10}
                        value={row.rir}
                        onChange={(e) => updateRow(idx, { rir: e.target.value })}
                        className="tabular-nums"
                      />
                    </label>
                  </div>
                </div>
              ))}

              <Button
                variant="secondary"
                size="sm"
                onClick={() => onSetRowsChange([...setRows, defaultSetRow()])}
              >
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Añadir serie</span>
              </Button>
            </div>

            <label className="block space-y-1 text-xs font-medium text-ink-muted">
              <span>Notas de fatiga / molestias</span>
              <Textarea
                rows={2}
                value={fatigueNotes}
                onChange={(e) => onFatigueNotesChange(e.target.value)}
                placeholder="Sensación de fatiga, molestias articulares, calidad del sueño…"
              />
            </label>

            <Button type="submit" size="lg" fullWidth>
              Guardar Sesión
            </Button>
          </form>
        </Surface>
      </div>

      {/* Right: Chronological Session History */}
      <div className="space-y-3 lg:col-span-5">
        <h3 className="heading-section text-lg text-ink">
          Historial de Sesiones de Entrenamiento
        </h3>

        {sessions.length === 0 ? (
          <Surface variant="inset" padded="md" className="text-xs text-ink-muted">
            Aún no hay sesiones registradas.
          </Surface>
        ) : (
          <div className="space-y-2.5">
            {sessions.map((s) => (
              <article
                key={s.id}
                className="rounded-panel border border-line bg-surface p-4 shadow-panel"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <h4 className="text-sm font-semibold text-ink">{s.name}</h4>
                    <p className="text-xs text-ink-muted tabular-nums">
                      {s.session_date} · {s.sets.length} series
                    </p>
                    {s.fatigue_notes && (
                      <p className="text-xs text-warning-text">{s.fatigue_notes}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => onEditSession(s)}>
                      Editar
                    </Button>
                    <ConfirmActionButton
                      label="Eliminar"
                      confirmLabel="Confirmar eliminación"
                      variant="danger"
                      size="sm"
                      onConfirm={() => onDeleteSession(s.id)}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
