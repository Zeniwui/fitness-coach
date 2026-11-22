import { Sparkles } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { MesocycleEditor } from "./MesocycleEditor";
import { statusBadgeLabel, statusBadgeTone, type MesocycleResponse } from "./types";
import type { MesocycleEditorActions, MesocycleEditorState } from "./useMesocycleEditorState";

interface MesocyclesTabProps {
  mesocycles: MesocycleResponse[];
  editor: MesocycleEditorState;
  actions: MesocycleEditorActions;
}

export function MesocyclesTab({ mesocycles, editor, actions }: MesocyclesTabProps) {
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
              value={editor.coachFocus}
              onChange={(e) => actions.setCoachFocus(e.target.value)}
              placeholder="Ej. priorizar espalda y brazos"
            />
          </div>
          <Button disabled={editor.draftingWithCoach} onClick={() => void actions.draftWithCoach()}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{editor.draftingWithCoach ? "Generando…" : "Generar borrador con Coach"}</span>
          </Button>
        </div>
      </Surface>

      {editor.editingMesoId && (
        <MesocycleEditor
          name={editor.editMesoName}
          goal={editor.editMesoGoal}
          weeks={editor.editMesoWeeks}
          plannedSessions={editor.editMesoSessions}
          onNameChange={actions.setEditName}
          onGoalChange={actions.setEditGoal}
          onWeeksChange={actions.setEditWeeks}
          onPlannedSessionsChange={actions.setEditSessions}
          onSave={(e) => void actions.saveEdit(e)}
          onCancel={actions.cancelEdit}
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
              <Button variant="secondary" size="sm" onClick={() => actions.startEdit(m)}>
                Editar
              </Button>
              {m.status === "draft" && (
                <Button size="sm" onClick={() => void actions.activate(m)}>
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
                  onConfirm={() => void actions.transitionStatus(m.id, "deload")}
                />
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
