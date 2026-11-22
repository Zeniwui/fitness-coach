import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { MesocycleEditor } from "./MesocycleEditor";
import {
  statusBadgeLabel,
  statusBadgeTone,
  type EditablePlannedSession,
  type MesocycleResponse,
} from "./types";

interface MesocyclesTabProps {
  mesocycles: MesocycleResponse[];
  coachFocus: string;
  draftingWithCoach: boolean;
  editingMesoId: string | null;
  editMesoName: string;
  editMesoGoal: string;
  editMesoWeeks: string;
  editMesoSessions: EditablePlannedSession[];
  onCoachFocusChange: (v: string) => void;
  onDraftWithCoach: () => void;
  onStartEdit: (meso: MesocycleResponse) => void;
  onCancelEdit: () => void;
  onEditNameChange: (v: string) => void;
  onEditGoalChange: (v: string) => void;
  onEditWeeksChange: (v: string) => void;
  onEditSessionsChange: (sessions: EditablePlannedSession[]) => void;
  onSaveEdit: (e: FormEvent) => void;
  onActivate: (meso: MesocycleResponse) => void;
  onTransitionStatus: (mesoId: string, status: "deload" | "completed" | "archived") => void;
}

export function MesocyclesTab({
  mesocycles,
  coachFocus,
  draftingWithCoach,
  editingMesoId,
  editMesoName,
  editMesoGoal,
  editMesoWeeks,
  editMesoSessions,
  onCoachFocusChange,
  onDraftWithCoach,
  onStartEdit,
  onCancelEdit,
  onEditNameChange,
  onEditGoalChange,
  onEditWeeksChange,
  onEditSessionsChange,
  onSaveEdit,
  onActivate,
  onTransitionStatus,
}: MesocyclesTabProps) {
  return (
    <div className="space-y-5">
      <Surface variant="focal" padded="md" className="space-y-3">
        <div className="space-y-1">
          <h2 className="heading-section text-lg text-ink">Diseñar Mesociclo con el Coach</h2>
          <p className="text-xs leading-relaxed text-ink-muted">
            El Coach genera un borrador respetando tu Perfil Vivo, equipamiento, lesiones activas y
            la Base de Conocimiento aprobada.
          </p>
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label
              htmlFor="meso-coach-focus"
              className="block text-xs font-medium text-ink-muted"
            >
              Enfoque opcional para el Coach
            </label>
            <Input
              id="meso-coach-focus"
              type="text"
              value={coachFocus}
              onChange={(e) => onCoachFocusChange(e.target.value)}
              placeholder="Ej. priorizar espalda y brazos"
            />
          </div>
          <Button disabled={draftingWithCoach} onClick={onDraftWithCoach}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{draftingWithCoach ? "Generando…" : "Generar borrador con Coach"}</span>
          </Button>
        </div>
      </Surface>

      {editingMesoId && (
        <MesocycleEditor
          name={editMesoName}
          goal={editMesoGoal}
          weeks={editMesoWeeks}
          plannedSessions={editMesoSessions}
          onNameChange={onEditNameChange}
          onGoalChange={onEditGoalChange}
          onWeeksChange={onEditWeeksChange}
          onPlannedSessionsChange={onEditSessionsChange}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
        />
      )}

      <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
        {mesocycles.map((m) => (
          <article
            key={m.id}
            className="flex flex-col justify-between space-y-3.5 rounded-panel border border-line bg-surface p-4 shadow-panel"
          >
            <div className="space-y-1.5">
              <Badge tone={statusBadgeTone(m.status)}>{statusBadgeLabel(m.status)}</Badge>
              <h3 className="heading-section text-lg text-ink">{m.name}</h3>
              <p className="text-xs text-ink-muted tabular-nums">
                {m.goal} · {m.duration_weeks} semanas · {m.planned_sessions.length} días/sem
              </p>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-3">
              <Button variant="secondary" size="sm" onClick={() => onStartEdit(m)}>
                Editar
              </Button>
              {m.status === "draft" && (
                <Button size="sm" onClick={() => onActivate(m)}>
                  Activar Mesociclo
                </Button>
              )}
              {m.status === "active" && (
                <ConfirmActionButton
                  label="Pasar a descarga"
                  confirmLabel="Confirmar descarga"
                  variant="soft"
                  confirmVariant="warning"
                  size="sm"
                  onConfirm={() => onTransitionStatus(m.id, "deload")}
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
