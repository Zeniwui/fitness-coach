import type { FormEvent } from "react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input, Select } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import {
  PHASE_TYPE_LABELS,
  type NutritionPhaseResponse,
  type NutritionPhaseType,
} from "./labels";

export interface PhaseFormState {
  phase_type: NutritionPhaseType;
  start_date: string;
  target_calories: string;
  protein_g: string;
  fat_g: string;
  carbs_g: string;
  target_weekly_weight_change_kg: string;
  notes: string;
}

interface ActivePhasePanelProps {
  activePhase: NutritionPhaseResponse | null;
  phaseForm: PhaseFormState;
  phaseMode: "create" | "edit";
  editorOpen: boolean;
  savingPhase: boolean;
  onChangeForm: (patch: Partial<PhaseFormState>) => void;
  onOpenEditor: (mode: "create" | "edit") => void;
  onCloseEditor: () => void;
  onCompletePhase: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function ActivePhasePanel({
  activePhase,
  phaseForm,
  phaseMode,
  editorOpen,
  savingPhase,
  onChangeForm,
  onOpenEditor,
  onCloseEditor,
  onCompletePhase,
  onSubmit,
}: ActivePhasePanelProps) {
  const proteinKcal = (activePhase?.protein_g ?? 0) * 4;
  const fatKcal = (activePhase?.fat_g ?? 0) * 9;
  const carbsKcal = (activePhase?.carbs_g ?? 0) * 4;
  const macroTotalKcal = Math.max(1, proteinKcal + fatKcal + carbsKcal);
  const proteinPct = Math.round((proteinKcal / macroTotalKcal) * 100);
  const fatPct = Math.round((fatKcal / macroTotalKcal) * 100);
  const carbsPct = Math.max(0, 100 - proteinPct - fatPct);

  const showForm = !activePhase || editorOpen;

  return (
    <Surface id="fase-activa" variant="focal" padded="md" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="heading-section text-xl text-ink">Fase Nutricional activa</h2>
          {activePhase ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{PHASE_TYPE_LABELS[activePhase.phase_type]}</Badge>
              <span className="text-xs text-ink-muted tabular-nums">
                Desde {activePhase.start_date}
              </span>
            </div>
          ) : (
            <p className="text-xs text-ink-muted">
              No tienes una Fase Nutricional activa. Configura una para guiar al Coach.
            </p>
          )}
        </div>
        {activePhase && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              aria-expanded={editorOpen && phaseMode === "edit"}
              onClick={() =>
                editorOpen && phaseMode === "edit" ? onCloseEditor() : onOpenEditor("edit")
              }
            >
              {editorOpen && phaseMode === "edit" ? "Cerrar editor" : "Ajustar fase"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={editorOpen && phaseMode === "create"}
              onClick={() =>
                editorOpen && phaseMode === "create" ? onCloseEditor() : onOpenEditor("create")
              }
            >
              Nueva fase
            </Button>
            <ConfirmActionButton
              label="Finalizar fase"
              confirmLabel="Confirmar fin"
              variant="soft"
              confirmVariant="danger"
              size="sm"
              disabled={savingPhase}
              onConfirm={onCompletePhase}
            />
          </div>
        )}
      </div>

      {activePhase && (
        <div className="space-y-3 rounded-panel border border-line bg-surface-muted/60 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-ink-muted">Objetivo</p>
              <p className="text-lg font-bold text-ink tabular-nums">
                {activePhase.target_calories} kcal
              </p>
            </div>
            <div>
              <p className="text-xs text-ink-muted">Ritmo semanal</p>
              <p className="text-lg font-bold text-ink tabular-nums">
                {activePhase.target_weekly_weight_change_kg > 0 ? "+" : ""}
                {activePhase.target_weekly_weight_change_kg} kg/sem
              </p>
            </div>
            <div className="col-span-2 grid grid-cols-3 gap-2 border-t border-line pt-2.5 sm:col-span-1 sm:border-t-0 sm:pt-0">
              <div>
                <p className="text-xs text-ink-muted">Proteína</p>
                <p className="text-sm font-semibold text-accent-text tabular-nums">
                  {activePhase.protein_g} g
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Grasas</p>
                <p className="text-sm font-semibold text-warning-text tabular-nums">
                  {activePhase.fat_g} g
                </p>
              </div>
              <div>
                <p className="text-xs text-ink-muted">Carbohidratos</p>
                <p className="text-sm font-semibold text-secondary-text tabular-nums">
                  {activePhase.carbs_g} g
                </p>
              </div>
            </div>
          </div>

          {/* Proportional macro energy distribution bar */}
          <div className="space-y-1.5">
            <div
              aria-hidden="true"
              className="flex h-2 w-full overflow-hidden rounded-full bg-surface"
            >
              <div className="bg-accent" style={{ width: `${proteinPct}%` }} />
              <div className="bg-warning" style={{ width: `${fatPct}%` }} />
              <div className="bg-secondary" style={{ width: `${carbsPct}%` }} />
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted tabular-nums">
              <span>Proteína {proteinPct}%</span>
              <span>Grasas {fatPct}%</span>
              <span>Carbohidratos {carbsPct}%</span>
            </div>
          </div>
          {activePhase.notes && (
            <p className="border-t border-line pt-2.5 text-xs text-ink-muted">
              {activePhase.notes}
            </p>
          )}
        </div>
      )}

      {showForm && (
        <form onSubmit={onSubmit} className="space-y-3.5 border-t border-line pt-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs font-medium text-ink-muted">
              <span>Tipo de fase</span>
              <Select
                value={phaseForm.phase_type}
                onChange={(e) => onChangeForm({ phase_type: e.target.value as NutritionPhaseType })}
              >
                {(Object.keys(PHASE_TYPE_LABELS) as NutritionPhaseType[]).map((type) => (
                  <option key={type} value={type}>
                    {PHASE_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </label>

            <label className="block space-y-1 text-xs font-medium text-ink-muted">
              <span>Ritmo semanal objetivo (kg/sem)</span>
              <Input
                type="number"
                step="0.05"
                value={phaseForm.target_weekly_weight_change_kg}
                onChange={(e) => onChangeForm({ target_weekly_weight_change_kg: e.target.value })}
                className="tabular-nums"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1 text-xs font-medium text-ink-muted">
              <span>Calorías objetivo (kcal)</span>
              <Input
                type="number"
                value={phaseForm.target_calories}
                onChange={(e) => onChangeForm({ target_calories: e.target.value })}
                className="tabular-nums"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-ink-muted">
              <span>Proteína (g)</span>
              <Input
                type="number"
                value={phaseForm.protein_g}
                onChange={(e) => onChangeForm({ protein_g: e.target.value })}
                className="tabular-nums"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-ink-muted">
              <span>Grasas (g)</span>
              <Input
                type="number"
                value={phaseForm.fat_g}
                onChange={(e) => onChangeForm({ fat_g: e.target.value })}
                className="tabular-nums"
              />
            </label>

            <label className="block space-y-1 text-xs font-medium text-ink-muted">
              <span>Carbohidratos (g)</span>
              <Input
                type="number"
                value={phaseForm.carbs_g}
                onChange={(e) => onChangeForm({ carbs_g: e.target.value })}
                className="tabular-nums"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Notas de la fase (opcional)</span>
            <Input
              type="text"
              value={phaseForm.notes}
              onChange={(e) => onChangeForm({ notes: e.target.value })}
              placeholder="Ej. 4 comidas al día, mayor carga de HC alrededor del entrenamiento"
            />
          </label>

          <Button type="submit" size="lg" fullWidth disabled={savingPhase}>
            {savingPhase
              ? "Guardando…"
              : phaseMode === "edit" && activePhase
                ? "Guardar cambios de fase"
                : "Activar Fase Nutricional"}
          </Button>
        </form>
      )}
    </Surface>
  );
}
