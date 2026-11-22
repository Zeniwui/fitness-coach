import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { PageHeader } from "../../ui/PageHeader";
import { MesocycleConflictModal } from "./MesocycleConflictModal";
import { MesocyclesTab } from "./MesocyclesTab";
import { SessionsTab } from "./SessionsTab";
import { TodaySessionTab } from "./TodaySessionTab";
import {
  defaultSetRow,
  type ConflictModalState,
  type EditableSetRow,
  type MesocycleResponse,
  type PlannedExerciseSchema,
  type SessionSetInput,
  type TodaySessionResponse,
  type TrainingSessionResponse,
  type TrainingTabKey,
  type WeeklyVolumeSummaryResponse,
} from "./types";
import { VolumeDeloadTab } from "./VolumeDeloadTab";

const TRAINING_TABS: ReadonlyArray<[TrainingTabKey, string]> = [
  ["today", "Hoy"],
  ["sessions", "Sesiones"],
  ["mesocycles", "Mesociclos"],
  ["volume", "Volumen y Descarga"],
];

export function TrainingPage() {
  const [activeTab, setActiveTab] = useState<TrainingTabKey>("today");
  const [loading, setLoading] = useState(true);
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
  const [editMesoSessions, setEditMesoSessions] = useState<
    Array<{ day_order: number; name: string; exercises: PlannedExerciseSchema[] }>
  >([]);

  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(null);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [sessionName, setSessionName] = useState("Sesión de Entrenamiento");
  const [sessionPlannedId, setSessionPlannedId] = useState<string | null>(null);
  const [fatigueNotes, setFatigueNotes] = useState("");
  const [setRows, setSetRows] = useState<EditableSetRow[]>([defaultSetRow()]);

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

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  function startLoggingTodaySession() {
    if (!todayData?.planned_session) return;
    setEditingSessionId(null);
    setSessionDate(new Date().toISOString().slice(0, 10));
    setSessionName(todayData.planned_session.name);
    setSessionPlannedId(todayData.planned_session.id);
    setFatigueNotes("");
    const prefilled: EditableSetRow[] = todayData.exercises.map((item) => ({
      exercise_name: item.planned.exercise_name,
      muscle_group: item.planned.primary_muscle_group,
      secondary_muscle_groups: (item.planned.secondary_muscle_groups ?? []).join(", "),
      reps: String(item.previous_mark?.best_reps ?? item.planned.rep_range_min ?? 8),
      load: String(item.previous_mark?.best_load ?? 20),
      unit: (item.previous_mark?.best_unit === "lb" ? "lb" : "kg") as "kg" | "lb",
      rir: String(item.planned.target_rir ?? 2),
      rpe: "",
    }));
    setSetRows(prefilled.length > 0 ? prefilled : [defaultSetRow()]);
    setActiveTab("sessions");
  }

  function startEditingSession(session: TrainingSessionResponse) {
    setEditingSessionId(session.id);
    setSessionDate(session.session_date);
    setSessionName(session.name);
    setSessionPlannedId(session.planned_session_id ?? null);
    setFatigueNotes(session.fatigue_notes ?? "");
    setSetRows(
      session.sets.map((s) => ({
        exercise_name: s.exercise_name,
        muscle_group: s.muscle_group,
        secondary_muscle_groups: (s.secondary_muscle_groups ?? []).join(", "),
        reps: String(s.reps),
        load: String(s.load),
        unit: s.unit === "lb" ? "lb" : "kg",
        rir: s.rir !== null && s.rir !== undefined ? String(s.rir) : "",
        rpe: s.rpe !== null && s.rpe !== undefined ? String(s.rpe) : "",
      })),
    );
    setActiveTab("sessions");
  }

  async function handleSaveSession(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    setFeedbackMsg(null);

    const parsedSets: SessionSetInput[] = setRows
      .filter((r) => r.exercise_name.trim().length > 0)
      .map((r, idx) => ({
        exercise_name: r.exercise_name.trim(),
        muscle_group: r.muscle_group.trim() || "pecho",
        secondary_muscle_groups: r.secondary_muscle_groups
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        set_order: idx + 1,
        reps: Math.max(1, Number(r.reps) || 1),
        load: Math.max(0, Number(r.load) || 0),
        unit: r.unit,
        rir: r.rir.trim() !== "" ? Number(r.rir) : null,
        rpe: r.rpe.trim() !== "" ? Number(r.rpe) : null,
      }));

    if (parsedSets.length === 0) {
      setErrorMsg("Añade al menos una serie con nombre de ejercicio.");
      return;
    }

    if (editingSessionId) {
      const res = await apiClient.PUT("/api/v1/training/sessions/{session_id}", {
        params: { path: { session_id: editingSessionId } },
        body: {
          session_date: sessionDate,
          name: sessionName.trim() || "Sesión de Entrenamiento",
          planned_session_id: sessionPlannedId,
          fatigue_notes: fatigueNotes.trim() || null,
          sets: parsedSets,
        },
      });
      if (res.error) {
        setErrorMsg("No se pudo actualizar la Sesión de Entrenamiento.");
        return;
      }
      setFeedbackMsg("Sesión de Entrenamiento actualizada.");
    } else {
      const res = await apiClient.POST("/api/v1/training/sessions", {
        body: {
          session_date: sessionDate,
          name: sessionName.trim() || "Sesión de Entrenamiento",
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
      setFeedbackMsg("Sesión de Entrenamiento registrada.");
    }

    setEditingSessionId(null);
    setFatigueNotes("");
    setSetRows([defaultSetRow()]);
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
        exercises: ps.exercises.map((ex) => ({ ...ex })),
      })),
    );
  }

  async function handleSaveMesocycleEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingMesoId) return;
    setErrorMsg(null);
    const res = await apiClient.PATCH("/api/v1/training/mesocycles/{mesocycle_id}", {
      params: { path: { mesocycle_id: editingMesoId } },
      body: {
        name: editMesoName.trim(),
        goal: editMesoGoal.trim(),
        duration_weeks: Number(editMesoWeeks) || 5,
        planned_sessions: editMesoSessions,
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

      {/* Segmented sub-navigation */}
      <div className="grid grid-cols-2 gap-1.5 rounded-panel border border-line bg-surface-muted/70 p-1 sm:grid-cols-4">
        {TRAINING_TABS.map(([key, label]) => {
          const active = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`min-h-[38px] rounded-control px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}
      {feedbackMsg && <AlertBanner tone="success">{feedbackMsg}</AlertBanner>}

      {loading ? (
        <p className="text-sm text-ink-muted">Cargando entrenamiento…</p>
      ) : (
        <>
          {activeTab === "today" && (
            <TodaySessionTab
              todayData={todayData}
              onSelectPlannedSession={(id) => void loadAll(id)}
              onStartLogging={startLoggingTodaySession}
              onGoToMesocycles={() => setActiveTab("mesocycles")}
            />
          )}

          {activeTab === "sessions" && (
            <SessionsTab
              activeMesocycleId={todayData?.active_mesocycle?.id ?? null}
              sessions={sessions}
              editingSessionId={editingSessionId}
              sessionName={sessionName}
              sessionDate={sessionDate}
              fatigueNotes={fatigueNotes}
              setRows={setRows}
              onSessionNameChange={setSessionName}
              onSessionDateChange={setSessionDate}
              onFatigueNotesChange={setFatigueNotes}
              onSetRowsChange={setSetRows}
              onCancelEdit={() => {
                setEditingSessionId(null);
                setSetRows([defaultSetRow()]);
              }}
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
              onCoachFocusChange={setCoachFocus}
              onDraftWithCoach={() => void handleDraftWithCoach()}
              onStartEdit={startEditingMesocycle}
              onCancelEdit={() => setEditingMesoId(null)}
              onEditNameChange={setEditMesoName}
              onEditGoalChange={setEditMesoGoal}
              onEditWeeksChange={setEditMesoWeeks}
              onSaveEdit={(e) => void handleSaveMesocycleEdit(e)}
              onActivate={(m) => void handleActivateMesocycle(m)}
              onTransitionStatus={(id, st) => void handleTransitionStatus(id, st)}
            />
          )}

          {activeTab === "volume" && <VolumeDeloadTab volumeSummary={volumeSummary} />}
        </>
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
