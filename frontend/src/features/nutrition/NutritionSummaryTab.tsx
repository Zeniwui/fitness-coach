import type { FormEvent } from "react";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import { ActivePhasePanel, type PhaseFormState } from "./ActivePhasePanel";
import { CoachAdjustmentCard } from "./CoachAdjustmentCard";
import type { NutritionPhaseResponse, WeeklyCheckInResponse } from "./labels";
import { WeightTrendChart } from "./WeightTrendChart";

interface NutritionSummaryTabProps {
  activePhase: NutritionPhaseResponse | null;
  checkins: WeeklyCheckInResponse[];
  latestCheckIn: WeeklyCheckInResponse | null;
  phaseForm: PhaseFormState;
  phaseMode: "create" | "edit";
  phaseEditorOpen: boolean;
  savingPhase: boolean;
  resolvingAdjustmentId: string | null;
  onChangePhaseForm: (patch: Partial<PhaseFormState>) => void;
  onOpenPhaseEditor: (mode: "create" | "edit") => void;
  onClosePhaseEditor: () => void;
  onCompletePhase: () => void;
  onSavePhase: (e: FormEvent) => void;
  onApplyAdjustment: (checkinId: string) => void;
  onDismissAdjustment: (checkinId: string) => void;
  onGoToCheckIn: () => void;
}

export function NutritionSummaryTab({
  activePhase,
  checkins,
  latestCheckIn,
  phaseForm,
  phaseMode,
  phaseEditorOpen,
  savingPhase,
  resolvingAdjustmentId,
  onChangePhaseForm,
  onOpenPhaseEditor,
  onClosePhaseEditor,
  onCompletePhase,
  onSavePhase,
  onApplyAdjustment,
  onDismissAdjustment,
  onGoToCheckIn,
}: NutritionSummaryTabProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ActivePhasePanel
            activePhase={activePhase}
            phaseForm={phaseForm}
            phaseMode={phaseMode}
            editorOpen={phaseEditorOpen}
            savingPhase={savingPhase}
            onChangeForm={onChangePhaseForm}
            onOpenEditor={onOpenPhaseEditor}
            onCloseEditor={onClosePhaseEditor}
            onCompletePhase={onCompletePhase}
            onSubmit={onSavePhase}
          />
        </div>

        <div className="lg:col-span-7">
          {latestCheckIn ? (
            <CoachAdjustmentCard
              latestCheckIn={latestCheckIn}
              resolvingAdjustmentId={resolvingAdjustmentId}
              onApply={onApplyAdjustment}
              onDismiss={onDismissAdjustment}
            />
          ) : (
            <Surface variant="inset" padded="md" className="space-y-3">
              <h2 className="heading-section text-lg text-ink">
                Análisis y ajuste del Coach
              </h2>
              <p className="max-w-[62ch] text-sm leading-relaxed text-ink-muted">
                Registra tu primer Check-in semanal para evaluar la tendencia de peso frente al
                ritmo objetivo y recibir propuestas de ajuste de calorías y macros.
              </p>
              <div>
                <Button variant="secondary" size="sm" onClick={onGoToCheckIn}>
                  Ir a Check-in semanal
                </Button>
              </div>
            </Surface>
          )}
        </div>
      </div>

      <WeightTrendChart checkins={checkins} activePhase={activePhase} />
    </div>
  );
}
