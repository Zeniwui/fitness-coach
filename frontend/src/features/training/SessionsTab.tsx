import type { FormEvent } from "react";
import { Plus } from "lucide-react";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input, Textarea } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { NaturalSessionLogger } from "../multimodal/NaturalSessionLogger";
import { ExerciseGroupCard } from "./ExerciseGroupCard";
import type { SessionAchievementSummary } from "./progression";
import { SessionAchievementBanner } from "./SessionAchievementBanner";
import { createDefaultExerciseGroup, hasSessionDraftContent } from "./sessionDraft";
import type { EditableExerciseGroup, TrainingSessionResponse } from "./types";

interface SessionsTabProps {
  activeMesocycleId: string | null;
  startedFromToday?: boolean;
  sessions: TrainingSessionResponse[];
  editingSessionId: string | null;
  sessionName: string;
  sessionDate: string;
  fatigueNotes: string;
  exerciseGroups: EditableExerciseGroup[];
  achievementSummary: SessionAchievementSummary | null;
  onDismissAchievement: () => void;
  onSessionNameChange: (v: string) => void;
  onSessionDateChange: (v: string) => void;
  onFatigueNotesChange: (v: string) => void;
  onExerciseGroupsChange: (groups: EditableExerciseGroup[]) => void;
  onDiscardDraft: () => void;
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
  exerciseGroups,
  achievementSummary,
  onDismissAchievement,
  onSessionNameChange,
  onSessionDateChange,
  onFatigueNotesChange,
  onExerciseGroupsChange,
  onDiscardDraft,
  onCancelEdit,
  onSaveSession,
  onEditSession,
  onDeleteSession,
  onNaturalSessionSaved,
}: SessionsTabProps) {
  const showDiscardDraft =
    !editingSessionId && hasSessionDraftContent(exerciseGroups, fatigueNotes);

  function updateGroup(idx: number, updated: EditableExerciseGroup) {
    onExerciseGroupsChange(exerciseGroups.map((g, i) => (i === idx ? updated : g)));
  }

  function removeGroup(idx: number) {
    if (exerciseGroups.length <= 1) return;
    onExerciseGroupsChange(exerciseGroups.filter((_, i) => i !== idx));
  }

  function addExerciseGroup() {
    onExerciseGroupsChange([...exerciseGroups, createDefaultExerciseGroup()]);
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      {/* Left: Achievement summary + Voice/NL logger + Grouped gym sheet */}
      <div className="space-y-5 lg:col-span-7">
        {achievementSummary && (
          <SessionAchievementBanner
            summary={achievementSummary}
            onDismiss={onDismissAchievement}
          />
        )}

        <NaturalSessionLogger
          key={startedFromToday ? "nl-collapsed" : "nl-default"}
          activeMesocycleId={activeMesocycleId}
          defaultCollapsed={startedFromToday}
          onSessionSaved={onNaturalSessionSaved}
        />

        <Surface variant="focal" padded="md">
          <form onSubmit={onSaveSession} className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
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
              <div className="flex flex-wrap items-center gap-2">
                {editingSessionId && (
                  <Button variant="ghost" size="sm" onClick={onCancelEdit}>
                    Cancelar edición
                  </Button>
                )}
                {showDiscardDraft && (
                  <ConfirmActionButton
                    label="Descartar borrador"
                    confirmLabel="Confirmar descarte"
                    variant="secondary"
                    confirmVariant="danger"
                    size="sm"
                    onConfirm={onDiscardDraft}
                  />
                )}
              </div>
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

            <div className="space-y-4">
              {exerciseGroups.map((group, idx) => (
                <ExerciseGroupCard
                  key={group.id}
                  group={group}
                  groupIndex={idx}
                  canRemoveGroup={exerciseGroups.length > 1}
                  onChange={(updated) => updateGroup(idx, updated)}
                  onRemoveGroup={() => removeGroup(idx)}
                />
              ))}

              <Button variant="secondary" size="sm" onClick={addExerciseGroup}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Añadir ejercicio</span>
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
