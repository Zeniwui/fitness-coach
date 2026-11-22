import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { PageHeader } from "../../ui/PageHeader";
import { SegmentedTabs, type SegmentedTabItem } from "../../ui/SegmentedTabs";
import { MesocycleConflictModal } from "./MesocycleConflictModal";
import { MesocyclesTab } from "./MesocyclesTab";
import { validateAndSanitizePlannedSessions } from "./mesocycleValidation";
import {
  evaluateSessionAchievements,
  type SessionAchievementSummary,
} from "./progression";
import {
  buildGroupsFromSession,
  buildGroupsFromTodaySession,
  clearPersistedSessionDraft,
  createDefaultExerciseGroup,
  hasSessionDraftContent,
  readPersistedSessionDraft,
  validateAndFlattenGroups,
  writePersistedSessionDraft,
} from "./sessionDraft";
import { SessionsTab } from "./SessionsTab";
import { TodaySessionTab } from "./TodaySessionTab";
import type {
  ConflictModalState,
  EditableExerciseGroup,
  EditablePlannedSession,
  MesocycleResponse,
  TodaySessionResponse,
  TrainingSessionResponse,
  TrainingTabKey,
  WeeklyVolumeSummaryResponse,
} from "./types";
import { VolumeDeloadTab } from "./VolumeDeloadTab";

const TRAINING_TABS: ReadonlyArray<SegmentedTabItem<TrainingTabKey>> = [
  { id: "today", label: "Hoy" },
  { id: "sessions", label: "Sesiones" },
  { id: "mesocycles", label: "Mesociclos" },
  { id: "volume", label: "Volumen y Descarga" },
];

export function TrainingPage() {
  const [activeTab, setActiveTab] = useState<TrainingTabKey>("today");
  const [loading, setLoading] = useState(true);
  const [switchingDay, setSwitchingDay] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const [todayData, setTodayData] = useState<TodaySessionResponse | null>(null);
  const [mesocycles, setMesocycles] = useState<MesocycleResponse[]>([]);
  const [sessions, setSessions] = useState<TrainingSessionResponse[]>([]);
  const [volumeSummary, setVolumeSummary] = useState<WeeklyVolumeSummaryResponse | null>(null);

  const [coachFocus, setCoachFocus] = useState("");
  const [draftingWithCoach, setDraftingWithCoach] = useState(false);

  const [editingMesoId, setEditingMesoId] = useState<string | null>(null);
  const [editMesoName, setEditMesoName] = useState("");
  const [editMesoGoal, setEditMesoGoal] = useState("");
  const [editMesoWeeks, setEditMesoWeeks] = useState("5");
  const [editMesoSessions, setEditMesoSessions] = useState<EditablePlannedSession[]>([]);

  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(null);

  const [initialDraft] = useState(readPersistedSessionDraft);
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(
    () => initialDraft?.sessionDate ?? new Date().toISOString().slice(0, 10),
  );
  const [sessionName, setSessionName] = useState(
    () => initialDraft?.sessionName ?? "Sesión de Entrenamiento",
  );
  const [sessionPlannedId, setSessionPlannedId] = useState<string | null>(
    () => initialDraft?.sessionPlannedId ?? null,
  );
  const [fatigueNotes, setFatigueNotes] = useState(() => initialDraft?.fatigueNotes ?? "");
  const [exerciseGroups, setExerciseGroups] = useState<EditableExerciseGroup[]>(
    () => initialDraft?.exerciseGroups ?? [createDefaultExerciseGroup()],
  );
  const [startedFromToday, setStartedFromToday] = useState(
    () => initialDraft?.startedFromToday ?? false,
  );
  const [achievementSummary, setAchievementSummary] =
    useState<SessionAchievementSummary | null>(null);

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

  useEffect(() => {
    if (editingSessionId) return;
    if (!hasSessionDraftContent(exerciseGroups, fatigueNotes)) {
      clearPersistedSessionDraft();
      return;
    }
    const timer = window.setTimeout(() => {
      writePersistedSessionDraft({
        version: 2,
        sessionDate,
        sessionName,
        sessionPlannedId,
        fatigueNotes,
        exerciseGroups,
        startedFromToday,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    editingSessionId,
    sessionDate,
    sessionName,
    sessionPlannedId,
    fatigueNotes,
    exerciseGroups,
    startedFromToday,
  ]);

  function resetBlankSessionDraft() {
    setEditingSessionId(null);
    setSessionDate(new Date().toISOString().slice(0, 10));
    setSessionName("Sesión de Entrenamiento");
    setSessionPlannedId(null);
    setFatigueNotes("");
    setStartedFromToday(false);
    setExerciseGroups([createDefaultExerciseGroup()]);
    clearPersistedSessionDraft();
  }

  function startLoggingTodaySession() {
    if (!todayData?.planned_session) return;
    setEditingSessionId(null);
    setAchievementSummary(null);
    setErrorMsg(null);
    setSessionDate(new Date().toISOString().slice(0, 10));
    setSessionName(todayData.planned_session.name);
    setSessionPlannedId(todayData.planned_session.id);
    setFatigueNotes("");
    setStartedFromToday(true);
    setExerciseGroups(buildGroupsFromTodaySession(todayData));
    setActiveTab("sessions");
  }

  function startEditingSession(session: TrainingSessionResponse) {
    setEditingSessionId(session.id);
    setAchievementSummary(null);
    setErrorMsg(null);
    setSessionDate(session.session_date);
    setSessionName(session.name);
    setSessionPlannedId(session.planned_session_id ?? null);
    setFatigueNotes(session.fatigue_notes ?? "");
    setStartedFromToday(false);
    setExerciseGroups(buildGroupsFromSession(session));
    setActiveTab("sessions");
  }

  async function handleSaveSession(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);

    const { sets: parsedSets, error: validationError } =
      validateAndFlattenGroups(exerciseGroups);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const resolvedName = sessionName.trim() || "Sesión de Entrenamiento";
    const priorSessionsSnapshot = sessions;
    const editedId = editingSessionId;

    if (editedId) {
      const res = await apiClient.PUT("/api/v1/training/sessions/{session_id}", {
        params: { path: { session_id: editedId } },
        body: {
          session_date: sessionDate,
          name: resolvedName,
          planned_session_id: sessionPlannedId,
          fatigue_notes: fatigueNotes.trim() || null,
          sets: parsedSets,
        },
      });
      if (res.error) {
        setErrorMsg("No se pudo actualizar la Sesión de Entrenamiento.");
        return;
      }
      setFeedbackMsg(
        `Sesión de Entrenamiento actualizada (${parsedSets.length} series registradas).`,
      );
    } else {
      const res = await apiClient.POST("/api/v1/training/sessions", {
        body: {
          session_date: sessionDate,
          name: resolvedName,
          mesocycle_id: todayData?.active_mesocycle?.id ?? null,
          planned_session_id: sessionPlannedId,
          origin: "manual_form",
          fatigue_notes: fatigueNotes.trim() || null,
          sets: parsedSets,
        },
      });
      if (res.error) {
        setErrorMsg("No se pudo guardar la Sesión de Entrenamiento.");
        return;
      }
      setFeedbackMsg(
        `Sesión de Entrenamiento registrada (${parsedSets.length} series guardadas en tu historial).`,
      );
    }

    const summary = evaluateSessionAchievements(
      parsedSets,
      priorSessionsSnapshot,
      resolvedName,
      editedId,
    );
    setAchievementSummary(summary);
    resetBlankSessionDraft();
    await loadAll();
  }

  async function handleDeleteSession(sessionId: string) {
    setErrorMsg(null);
    const res = await apiClient.DELETE("/api/v1/training/sessions/{session_id}", {
      params: { path: { session_id: sessionId } },
    });
    if (res.error) {
      setErrorMsg("No se pudo eliminar la Sesión de Entrenamiento.");
      return;
    }
    setAchievementSummary(null);
    setFeedbackMsg("Sesión de Entrenamiento eliminada.");
    await loadAll();
  }

  async function handleDraftWithCoach() {
    setDraftingWithCoach(true);
    setErrorMsg(null);
    setFeedbackMsg(null);
    try {
      const res = await apiClient.POST("/api/v1/training/mesocycles/draft-with-coach", {
        body: { focus_notes: coachFocus.trim() || null },
      });
      if (res.error || !res.data) {
        setErrorMsg("No se pudo generar el borrador de Mesociclo con el Coach.");
        return;
      }
      setCoachFocus("");
      setFeedbackMsg(res.data.coach_rationale_es || "Borrador de Mesociclo generado.");
      await loadAll();
    } finally {
      setDraftingWithCoach(false);
    }
  }

  function startEditingMesocycle(meso: MesocycleResponse) {
    setEditingMesoId(meso.id);
    setEditMesoName(meso.name);
    setEditMesoGoal(meso.goal);
    setEditMesoWeeks(String(meso.duration_weeks));
    setEditMesoSessions(
      meso.planned_sessions.map((ps) => ({
        day_order: ps.day_order,
        name: ps.name,
        exercises: ps.exercises.map((ex) => ({
          ...ex,
          secondary_muscle_groups: [...(ex.secondary_muscle_groups ?? [])],
        })),
      })),
    );
  }

  async function handleSaveMesocycleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingMesoId) return;
    setErrorMsg(null);

    const { sessions: sanitizedSessions, error: validationError } =
      validateAndSanitizePlannedSessions(editMesoSessions);
    if (validationError) {
      setErrorMsg(validationError);
      return;
    }

    const res = await apiClient.PATCH("/api/v1/training/mesocycles/{mesocycle_id}", {
      params: { path: { mesocycle_id: editingMesoId } },
      body: {
        name: editMesoName.trim(),
        goal: editMesoGoal.trim(),
        duration_weeks: Number(editMesoWeeks) || 5,
        planned_sessions: sanitizedSessions,
      },
    });
    if (res.error) {
      setErrorMsg("No se pudieron guardar los cambios del Mesociclo.");
      return;
    }
    setEditingMesoId(null);
    setFeedbackMsg("Mesociclo actualizado correctamente.");
    await loadAll();
  }

  async function handleActivateMesocycle(
    meso: MesocycleResponse,
    confirmTransition?: "completed" | "archived",
  ) {
    setErrorMsg(null);
    setFeedbackMsg(null);
    const res = await apiClient.POST("/api/v1/training/mesocycles/{mesocycle_id}/activate", {
      params: { path: { mesocycle_id: meso.id } },
      body: confirmTransition ? { confirm_transition_status: confirmTransition } : {},
    });

    if (res.response.status === 409) {
      const detail = (res.error as { detail?: Record<string, string> } | undefined)?.detail;
      setConflictModal({
        targetMesocycleId: meso.id,
        targetMesocycleName: meso.name,
        activeMesocycleName: detail?.active_mesocycle_name || "Mesociclo actual",
      });
      return;
    }

    if (res.error) {
      setErrorMsg("No se pudo activar el Mesociclo.");
      return;
    }

    setConflictModal(null);
    setFeedbackMsg("Mesociclo activado correctamente.");
    await loadAll();
  }

  async function handleTransitionStatus(
    mesoId: string,
    status: "deload" | "completed" | "archived",
  ) {
    setErrorMsg(null);
    const res = await apiClient.POST("/api/v1/training/mesocycles/{mesocycle_id}/status", {
      params: { path: { mesocycle_id: mesoId } },
      body: { status },
    });
    if (res.error) {
      setErrorMsg("No se pudo cambiar el estado del Mesociclo.");
      return;
    }
    setFeedbackMsg("Estado del Mesociclo actualizado.");
    await loadAll();
  }

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
              onStartLogging={startLoggingTodaySession}
              onGoToMesocycles={() => setActiveTab("mesocycles")}
            />
          )}

          {activeTab === "sessions" && (
            <SessionsTab
              activeMesocycleId={todayData?.active_mesocycle?.id ?? null}
              startedFromToday={startedFromToday}
              sessions={sessions}
              editingSessionId={editingSessionId}
              sessionName={sessionName}
              sessionDate={sessionDate}
              fatigueNotes={fatigueNotes}
              exerciseGroups={exerciseGroups}
              achievementSummary={achievementSummary}
              onDismissAchievement={() => setAchievementSummary(null)}
              onSessionNameChange={setSessionName}
              onSessionDateChange={setSessionDate}
              onFatigueNotesChange={setFatigueNotes}
              onExerciseGroupsChange={setExerciseGroups}
              onDiscardDraft={() => {
                resetBlankSessionDraft();
                setErrorMsg(null);
                setFeedbackMsg("Borrador local descartado.");
              }}
              onCancelEdit={resetBlankSessionDraft}
              onSaveSession={(e) => void handleSaveSession(e)}
              onEditSession={startEditingSession}
              onDeleteSession={(id) => void handleDeleteSession(id)}
              onNaturalSessionSaved={async () => {
                setFeedbackMsg(
                  "Sesión de Entrenamiento confirmada y guardada en tu historial.",
                );
                await loadAll();
              }}
            />
          )}

          {activeTab === "mesocycles" && (
            <MesocyclesTab
              mesocycles={mesocycles}
              coachFocus={coachFocus}
              draftingWithCoach={draftingWithCoach}
              editingMesoId={editingMesoId}
              editMesoName={editMesoName}
              editMesoGoal={editMesoGoal}
              editMesoWeeks={editMesoWeeks}
              editMesoSessions={editMesoSessions}
              onCoachFocusChange={setCoachFocus}
              onDraftWithCoach={() => void handleDraftWithCoach()}
              onStartEdit={startEditingMesocycle}
              onCancelEdit={() => setEditingMesoId(null)}
              onEditNameChange={setEditMesoName}
              onEditGoalChange={setEditMesoGoal}
              onEditWeeksChange={setEditMesoWeeks}
              onEditSessionsChange={setEditMesoSessions}
              onSaveEdit={(e) => void handleSaveMesocycleEdit(e)}
              onActivate={(m) => void handleActivateMesocycle(m)}
              onTransitionStatus={(id, st) => void handleTransitionStatus(id, st)}
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
            if (target) void handleActivateMesocycle(target, transition);
          }}
          onCancel={() => setConflictModal(null)}
        />
      )}
    </section>
  );
}
