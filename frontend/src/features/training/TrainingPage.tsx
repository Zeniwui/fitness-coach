import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { PageHeader } from "../../ui/PageHeader";
import { SegmentedTabs, type SegmentedTabItem } from "../../ui/SegmentedTabs";
import { useAuth } from "../auth/AuthContext";
import { MesocycleConflictModal } from "./MesocycleConflictModal";
import { MesocyclesTab } from "./MesocyclesTab";
import { SessionsTab } from "./SessionsTab";
import { TodaySessionTab } from "./TodaySessionTab";
import type {
  MesocycleResponse,
  TodaySessionResponse,
  TrainingSessionResponse,
  TrainingTabKey,
  WeeklyVolumeSummaryResponse,
} from "./types";
import { useMesocycleEditorState } from "./useMesocycleEditorState";
import { useTrainingSessionDraft } from "./useTrainingSessionDraft";
import { VolumeDeloadTab } from "./VolumeDeloadTab";

const TRAINING_TABS: ReadonlyArray<SegmentedTabItem<TrainingTabKey>> = [
  { id: "today", label: "Hoy" },
  { id: "sessions", label: "Sesiones" },
  { id: "mesocycles", label: "Mesociclos" },
  { id: "volume", label: "Volumen y Descarga" },
];

export function TrainingPage() {
  const { athlete } = useAuth();
  const athleteKey = athlete?.athlete_id || athlete?.email || null;

  const [activeTab, setActiveTab] = useState<TrainingTabKey>("today");
  const [loading, setLoading] = useState(true);
  const [switchingDay, setSwitchingDay] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const [todayData, setTodayData] = useState<TodaySessionResponse | null>(null);
  const [mesocycles, setMesocycles] = useState<MesocycleResponse[]>([]);
  const [sessions, setSessions] = useState<TrainingSessionResponse[]>([]);
  const [volumeSummary, setVolumeSummary] = useState<WeeklyVolumeSummaryResponse | null>(null);

  const loadAll = useCallback(async (plannedSessionId?: string) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [todayRes, mesoRes, sessRes, volRes] = await Promise.all([
        apiClient.GET("/api/v1/training/today", {
          params: plannedSessionId ? { query: { planned_session_id: plannedSessionId } } : {},
        }),
        apiClient.GET("/api/v1/training/mesocycles"),
        apiClient.GET("/api/v1/training/sessions"),
        apiClient.GET("/api/v1/training/volume-summary"),
      ]);
      if (todayRes.data) setTodayData(todayRes.data);
      if (mesoRes.data) setMesocycles(mesoRes.data);
      if (sessRes.data) setSessions(sessRes.data);
      if (volRes.data) setVolumeSummary(volRes.data);
    } catch {
      setErrorMsg("No se pudieron cargar los datos de entrenamiento.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTodaySession = useCallback(async (plannedSessionId: string) => {
    setSwitchingDay(true);
    setErrorMsg(null);
    try {
      const todayRes = await apiClient.GET("/api/v1/training/today", {
        params: { query: { planned_session_id: plannedSessionId } },
      });
      if (todayRes.data) {
        setTodayData(todayRes.data);
      } else {
        setErrorMsg("No se pudo cargar la sesión planificada seleccionada.");
      }
    } catch {
      setErrorMsg("Error de conexión al cambiar el día planificado.");
    } finally {
      setSwitchingDay(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const { draftState, draftActions, startLoggingTodaySession } = useTrainingSessionDraft({
    athleteKey,
    activeMesocycleId: todayData?.active_mesocycle?.id ?? null,
    sessions,
    loadAll,
    setErrorMsg,
    setFeedbackMsg,
    onOpenSessionsTab: () => setActiveTab("sessions"),
  });

  const { editorState, editorActions, conflictModal, dismissConflictModal } =
    useMesocycleEditorState({
      loadAll,
      setErrorMsg,
      setFeedbackMsg,
    });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Entrenamiento"
        description="Planificación de Mesociclos, sesión de hoy con marcas previas, registro rápido y volumen semanal efectivo."
      />

      <SegmentedTabs
        items={TRAINING_TABS}
        activeId={activeTab}
        onChange={setActiveTab}
        ariaLabel="Vistas de Entrenamiento"
        idPrefix="training"
        layout="grid"
      />

      {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}
      {feedbackMsg && <AlertBanner tone="success">{feedbackMsg}</AlertBanner>}

      {loading ? (
        <p role="status" className="text-sm text-ink-muted">
          Cargando entrenamiento…
        </p>
      ) : (
        <div
          id={`training-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`training-tab-${activeTab}`}
        >
          {activeTab === "today" && (
            <TodaySessionTab
              todayData={todayData}
              switchingDay={switchingDay}
              onSelectPlannedSession={(id) => void loadTodaySession(id)}
              onStartLogging={() => startLoggingTodaySession(todayData)}
              onGoToMesocycles={() => setActiveTab("mesocycles")}
            />
          )}

          {activeTab === "sessions" && (
            <SessionsTab
              activeMesocycleId={todayData?.active_mesocycle?.id ?? null}
              sessions={sessions}
              draft={draftState}
              actions={draftActions}
            />
          )}

          {activeTab === "mesocycles" && (
            <MesocyclesTab
              mesocycles={mesocycles}
              editor={editorState}
              actions={editorActions}
            />
          )}

          {activeTab === "volume" && (
            <VolumeDeloadTab volumeSummary={volumeSummary} sessions={sessions} />
          )}
        </div>
      )}

      {conflictModal && (
        <MesocycleConflictModal
          modal={conflictModal}
          onResolve={(transition) => {
            const target = mesocycles.find((m) => m.id === conflictModal.targetMesocycleId);
            if (target) void editorActions.activate(target, transition);
          }}
          onCancel={dismissConflictModal}
        />
      )}
    </section>
  );
}
