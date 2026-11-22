import { useEffect, useRef, useState } from "react";
import { AlertBanner } from "../../ui/AlertBanner";
import { PageHeader } from "../../ui/PageHeader";
import { SegmentedTabs, type SegmentedTabItem } from "../../ui/SegmentedTabs";
import { NutritionHistorySection } from "./NutritionHistorySection";
import { NutritionSummaryTab } from "./NutritionSummaryTab";
import { useNutritionWorkflow, type NutritionTab } from "./useNutritionWorkflow";
import { WeeklyCheckInForm } from "./WeeklyCheckInForm";

export function NutritionPage() {
  const [activeTab, setActiveTab] = useState<NutritionTab>("summary");
  const errorBannerRef = useRef<HTMLDivElement | null>(null);
  const nutrition = useNutritionWorkflow(setActiveTab);

  useEffect(() => {
    if (
      nutrition.error &&
      errorBannerRef.current &&
      typeof errorBannerRef.current.scrollIntoView === "function"
    ) {
      errorBannerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [nutrition.error]);

  if (nutrition.loading) {
    return (
      <section className="space-y-4">
        <PageHeader
          title="Nutrición"
          description="Gestiona tu Fase Nutricional activa, registra tu Check-in semanal y revisa las propuestas de ajuste del Coach."
        />
        <p role="status" className="text-sm text-ink-muted">
          Cargando Fase Nutricional y Check-ins…
        </p>
      </section>
    );
  }

  const hasPendingAdjustment = nutrition.latestCheckIn?.adjustment_status === "proposed";
  const historyCount = nutrition.checkins.length + nutrition.completedPhases.length;

  const tabs: ReadonlyArray<SegmentedTabItem<NutritionTab>> = [
    {
      id: "summary",
      label: "Resumen y Ajuste",
      indicator: hasPendingAdjustment ? "Pendiente" : undefined,
    },
    { id: "checkin", label: "Check-in semanal" },
    {
      id: "history",
      label: "Historial",
      count: historyCount > 0 ? historyCount : undefined,
    },
  ];

  return (
    <section className="space-y-6 pb-8">
      <PageHeader
        title="Nutrición"
        description="Gestiona tu Fase Nutricional activa, registra tu Check-in semanal y revisa las propuestas de ajuste del Coach."
      />

      <SegmentedTabs
        items={tabs}
        activeId={activeTab}
        onChange={setActiveTab}
        ariaLabel="Vistas de Nutrición"
        idPrefix="nutrition"
      />

      {nutrition.error && (
        <div ref={errorBannerRef}>
          <AlertBanner tone="error">{nutrition.error}</AlertBanner>
        </div>
      )}
      {nutrition.statusMessage && <AlertBanner tone="success">{nutrition.statusMessage}</AlertBanner>}

      <div
        id={`nutrition-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`nutrition-tab-${activeTab}`}
      >
        {activeTab === "summary" && (
          <NutritionSummaryTab
            activePhase={nutrition.activePhase}
            checkins={nutrition.checkins}
            latestCheckIn={nutrition.latestCheckIn}
            phaseForm={nutrition.phaseForm}
            phaseMode={nutrition.phaseMode}
            phaseEditorOpen={nutrition.phaseEditorOpen}
            savingPhase={nutrition.savingPhase}
            resolvingAdjustmentId={nutrition.resolvingAdjustmentId}
            onChangePhaseForm={(patch) =>
              nutrition.setPhaseForm((prev) => ({ ...prev, ...patch }))
            }
            onOpenPhaseEditor={nutrition.openPhaseEditor}
            onClosePhaseEditor={() => nutrition.setPhaseEditorOpen(false)}
            onCompletePhase={() => void nutrition.handleCompleteActivePhase()}
            onSavePhase={(e) => void nutrition.handleSavePhase(e)}
            onApplyAdjustment={(id) => void nutrition.handleApplyAdjustment(id)}
            onDismissAdjustment={(id) => void nutrition.handleDismissAdjustment(id)}
            onGoToCheckIn={() => setActiveTab("checkin")}
          />
        )}

        {activeTab === "checkin" && (
          <WeeklyCheckInForm
            form={nutrition.checkinForm}
            submitting={nutrition.submittingCheckIn}
            onChange={(patch) => nutrition.setCheckinForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={(e) => void nutrition.handleSubmitCheckIn(e)}
          />
        )}

        {activeTab === "history" && (
          <NutritionHistorySection
            checkins={nutrition.checkins}
            completedPhases={nutrition.completedPhases}
          />
        )}
      </div>
    </section>
  );
}
