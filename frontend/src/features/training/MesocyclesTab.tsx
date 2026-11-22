import type { FormEvent } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import {
  statusBadgeLabel,
  statusBadgeTone,
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
  onCoachFocusChange: (v: string) => void;
  onDraftWithCoach: () => void;
  onStartEdit: (meso: MesocycleResponse) => void;
  onCancelEdit: () => void;
  onEditNameChange: (v: string) => void;
  onEditGoalChange: (v: string) => void;
  onEditWeeksChange: (v: string) => void;
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
  onCoachFocusChange,
  onDraftWithCoach,
  onStartEdit,
  onCancelEdit,
  onEditNameChange,
  onEditGoalChange,
  onEditWeeksChange,
  onSaveEdit,
  onActivate,
  onTransitionStatus,
}: MesocyclesTabProps) {
  return (
    <div className="space-y-5">
      <Surface variant="classical" padded="md" className="space-y-3">
        <div className="space-y-1">
          <h2 className="heading-section text-lg text-ink">Diseñar Mesociclo con el Coach</h2>
          <p className="text-xs leading-relaxed text-ink-muted">
            El Coach genera un borrador respetando tu Perfil Vivo, equipamiento, lesiones activas y
            la Base de Conocimiento aprobada.
          </p>
        </div>
        <div className="flex flex-col gap-2.5 sm:flex-row">
          <Input
            type="text"
            value={coachFocus}
            onChange={(e) => onCoachFocusChange(e.target.value)}
            placeholder="Enfoque opcional (ej. priorizar espalda y brazos)"
            className="flex-1"
          />
          <Button disabled={draftingWithCoach} onClick={onDraftWithCoach}>
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            <span>{draftingWithCoach ? "Generando…" : "Generar borrador con Coach"}</span>
          </Button>
        </div>
      </Surface>

      {editingMesoId && (
        <Surface variant="accent" padded="md">
          <form onSubmit={onSaveEdit} className="space-y-4">
            <h3 className="heading-section text-base text-accent-text">Editar Mesociclo</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Nombre del Mesociclo</span>
                <Input
                  type="text"
                  value={editMesoName}
                  onChange={(e) => onEditNameChange(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Objetivo</span>
                <Input
                  type="text"
                  value={editMesoGoal}
                  onChange={(e) => onEditGoalChange(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Duración (semanas)</span>
                <Input
                  type="number"
                  min={2}
                  max={16}
                  value={editMesoWeeks}
                  onChange={(e) => onEditWeeksChange(e.target.value)}
                  required
                  className="tabular-nums"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" size="sm">
                Guardar cambios
              </Button>
              <Button variant="secondary" size="sm" onClick={onCancelEdit}>
                Cancelar
              </Button>
            </div>
          </form>
        </Surface>
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
                <Button
                  variant="soft"
                  size="sm"
                  onClick={() => onTransitionStatus(m.id, "deload")}
                >
                  Pasar a descarga
                </Button>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
