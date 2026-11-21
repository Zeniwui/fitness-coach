import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";

type MesocycleResponse = components["schemas"]["MesocycleResponse"];
type TodaySessionResponse = components["schemas"]["TodaySessionResponse"];
type TrainingSessionResponse = components["schemas"]["TrainingSessionResponse"];
type WeeklyVolumeSummaryResponse = components["schemas"]["WeeklyVolumeSummaryResponse"];
type PlannedExerciseSchema = components["schemas"]["PlannedExerciseSchema"];
type SessionSetInput = components["schemas"]["SessionSetInput"];

type TabKey = "today" | "sessions" | "mesocycles" | "volume";

interface ConflictModalState {
  targetMesocycleId: string;
  targetMesocycleName: string;
  activeMesocycleName: string;
}

interface EditableSetRow {
  exercise_name: string;
  muscle_group: string;
  secondary_muscle_groups: string;
  reps: string;
  load: string;
  unit: "kg" | "lb";
  rir: string;
  rpe: string;
}

function defaultSetRow(): EditableSetRow {
  return {
    exercise_name: "",
    muscle_group: "pecho",
    secondary_muscle_groups: "",
    reps: "8",
    load: "20",
    unit: "kg",
    rir: "2",
    rpe: "",
  };
}

function statusBadgeLabel(status: string): string {
  switch (status) {
    case "active":
      return "Activo";
    case "deload":
      return "En descarga";
    case "draft":
      return "Borrador";
    case "completed":
      return "Completado";
    case "archived":
      return "Archivado";
    default:
      return status;
  }
}

export function TrainingPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  const [todayData, setTodayData] = useState<TodaySessionResponse | null>(null);
  const [mesocycles, setMesocycles] = useState<MesocycleResponse[]>([]);
  const [sessions, setSessions] = useState<TrainingSessionResponse[]>([]);
  const [volumeSummary, setVolumeSummary] = useState<WeeklyVolumeSummaryResponse | null>(null);

  // Coach draft form state
  const [coachFocus, setCoachFocus] = useState("");
  const [draftingWithCoach, setDraftingWithCoach] = useState(false);

  // Manual Mesocycle editor state (for editing an existing mesocycle)
  const [editingMesoId, setEditingMesoId] = useState<string | null>(null);
  const [editMesoName, setEditMesoName] = useState("");
  const [editMesoGoal, setEditMesoGoal] = useState("");
  const [editMesoWeeks, setEditMesoWeeks] = useState("5");
  const [editMesoSessions, setEditMesoSessions] = useState<
    Array<{ day_order: number; name: string; exercises: PlannedExerciseSchema[] }>
  >([]);

  // Single-active Mesocycle confirmation modal
  const [conflictModal, setConflictModal] = useState<ConflictModalState | null>(null);

  // Quick Training Session logger / editor state
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

  async function handleSaveSession(e: React.FormEvent) {
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
        body: {
          focus_notes: coachFocus.trim() || null,
        },
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

  async function handleSaveMesocycleEdit(e: React.FormEvent) {
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

  async function handleTransitionStatus(mesoId: string, status: "deload" | "completed" | "archived") {
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
    <section className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-white">Entreno</h1>
        <p className="text-xs text-slate-400">
          Planificación de Mesociclos, sesión de hoy con marcas previas, registro rápido y volumen
          semanal efectivo.
        </p>
      </header>

      {/* Mobile-first sub-navigation */}
      <div className="grid grid-cols-4 gap-1.5 rounded-xl bg-slate-900 p-1">
        {(
          [
            ["today", "Hoy"],
            ["sessions", "Sesiones"],
            ["mesocycles", "Mesociclos"],
            ["volume", "Volumen y Descarga"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${
              activeTab === key
                ? "bg-emerald-500 text-slate-950"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs text-rose-200"
        >
          {errorMsg}
        </div>
      )}

      {feedbackMsg && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
        >
          {feedbackMsg}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Cargando entrenamiento…</p>
      ) : (
        <>
          {/* TAB 1: TODAY'S SESSION + PREVIOUS MARKS */}
          {activeTab === "today" && (
            <div className="space-y-4">
              {todayData?.active_mesocycle ? (
                <>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                          {statusBadgeLabel(todayData.active_mesocycle.status)}
                        </span>
                        <h2 className="mt-1 text-base font-bold text-white">
                          {todayData.active_mesocycle.name}
                        </h2>
                        <p className="text-xs text-slate-400">
                          {todayData.active_mesocycle.goal} ·{" "}
                          {todayData.active_mesocycle.duration_weeks} semanas ·{" "}
                          {todayData.completed_sessions_in_mesocycle} sesiones completadas
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={startLoggingTodaySession}
                        className="rounded-xl bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                      >
                        Registrar esta sesión
                      </button>
                    </div>

                    {/* Day switcher */}
                    {todayData.active_mesocycle.planned_sessions.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {todayData.active_mesocycle.planned_sessions.map((ps) => (
                          <button
                            key={ps.id}
                            type="button"
                            onClick={() => void loadAll(ps.id)}
                            className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                              todayData.planned_session?.id === ps.id
                                ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                                : "border-slate-700 text-slate-300 hover:border-slate-500"
                            }`}
                          >
                            Día {ps.day_order}: {ps.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {todayData.planned_session && (
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold text-slate-200">
                        Sesión planificada: {todayData.planned_session.name}
                      </h3>
                      {todayData.exercises.map((item) => (
                        <article
                          key={item.planned.exercise_name}
                          className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-semibold text-white">
                                {item.planned.exercise_name}
                              </h4>
                              <p className="text-xs text-slate-400">
                                {item.planned.target_sets} series · {item.planned.rep_range_min}–
                                {item.planned.rep_range_max} reps
                                {item.planned.target_rir !== null &&
                                item.planned.target_rir !== undefined
                                  ? ` · RIR ${item.planned.target_rir}`
                                  : ""}
                                {" · "}
                                <span className="capitalize">
                                  {item.planned.primary_muscle_group}
                                </span>
                              </p>
                            </div>
                          </div>

                          <div className="mt-2.5 rounded-lg bg-slate-950/70 px-3 py-2 text-xs">
                            {item.previous_mark ? (
                              <div className="space-y-1">
                                <p className="font-medium text-emerald-300">
                                  Marca previa ({item.previous_mark.last_session_date}): mejor{" "}
                                  {item.previous_mark.best_load} {item.previous_mark.best_unit} ×{" "}
                                  {item.previous_mark.best_reps}
                                  {item.previous_mark.best_rir !== null &&
                                  item.previous_mark.best_rir !== undefined
                                    ? ` @ RIR ${item.previous_mark.best_rir}`
                                    : ""}
                                </p>
                                <p className="text-slate-400">
                                  Última sesión:{" "}
                                  {item.previous_mark.last_sets
                                    .map(
                                      (s) =>
                                        `${s.load}${s.unit}×${s.reps}${
                                          s.rir !== null && s.rir !== undefined
                                            ? ` (RIR ${s.rir})`
                                            : ""
                                        }`,
                                    )
                                    .join(" · ")}
                                </p>
                              </div>
                            ) : (
                              <p className="text-slate-500">
                                Sin marcas previas registradas para este ejercicio.
                              </p>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-700 p-6 text-center">
                  <p className="text-sm font-medium text-slate-200">
                    No tienes ningún Mesociclo activo.
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Genera un borrador personalizado con el Coach o activa uno existente en la
                    pestaña Mesociclos.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveTab("mesocycles")}
                    className="mt-3 rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950"
                  >
                    Ir a Mesociclos
                  </button>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: QUICK SESSION LOGGER & HISTORY */}
          {activeTab === "sessions" && (
            <div className="space-y-5">
              <form
                onSubmit={handleSaveSession}
                className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-4"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">
                    {editingSessionId
                      ? "Editar Sesión de Entrenamiento"
                      : "Registro rápido de Sesión de Entrenamiento"}
                  </h2>
                  {editingSessionId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingSessionId(null);
                        setSetRows([defaultSetRow()]);
                      }}
                      className="text-xs text-slate-400 underline"
                    >
                      Cancelar edición
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-xs text-slate-300">
                    Nombre de la sesión
                    <input
                      type="text"
                      value={sessionName}
                      onChange={(e) => setSessionName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      required
                    />
                  </label>
                  <label className="block text-xs text-slate-300">
                    Fecha
                    <input
                      type="date"
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
                      required
                    />
                  </label>
                </div>

                <div className="space-y-2.5">
                  {setRows.map((row, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-6"
                    >
                      <label className="col-span-2 block text-[11px] text-slate-400">
                        Ejercicio
                        <input
                          type="text"
                          value={row.exercise_name}
                          onChange={(e) => {
                            const next = [...setRows];
                            next[idx] = { ...next[idx], exercise_name: e.target.value };
                            setSetRows(next);
                          }}
                          placeholder="Ej. Press inclinado"
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Músculo
                        <input
                          type="text"
                          value={row.muscle_group}
                          onChange={(e) => {
                            const next = [...setRows];
                            next[idx] = { ...next[idx], muscle_group: e.target.value };
                            setSetRows(next);
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Carga ({row.unit})
                        <input
                          type="number"
                          step="0.5"
                          value={row.load}
                          onChange={(e) => {
                            const next = [...setRows];
                            next[idx] = { ...next[idx], load: e.target.value };
                            setSetRows(next);
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        Repeticiones
                        <input
                          type="number"
                          value={row.reps}
                          onChange={(e) => {
                            const next = [...setRows];
                            next[idx] = { ...next[idx], reps: e.target.value };
                            setSetRows(next);
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                      <label className="block text-[11px] text-slate-400">
                        RIR
                        <input
                          type="number"
                          step="0.5"
                          value={row.rir}
                          onChange={(e) => {
                            const next = [...setRows];
                            next[idx] = { ...next[idx], rir: e.target.value };
                            setSetRows(next);
                          }}
                          className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                        />
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => setSetRows((prev) => [...prev, defaultSetRow()])}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500"
                  >
                    + Añadir serie
                  </button>
                </div>

                <label className="block text-xs text-slate-300">
                  Notas de fatiga / molestias
                  <textarea
                    rows={2}
                    value={fatigueNotes}
                    onChange={(e) => setFatigueNotes(e.target.value)}
                    placeholder="Sensación de fatiga, molestias articulares, calidad del sueño…"
                    className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                </label>

                <button
                  type="submit"
                  className="w-full rounded-xl bg-emerald-500 py-2.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                >
                  Guardar Sesión
                </button>
              </form>

              {/* Session History */}
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-slate-200">
                  Historial de Sesiones de Entrenamiento
                </h3>
                {sessions.length === 0 ? (
                  <p className="text-xs text-slate-500">Aún no hay sesiones registradas.</p>
                ) : (
                  sessions.map((s) => (
                    <article
                      key={s.id}
                      className="rounded-xl border border-slate-800 bg-slate-900/60 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h4 className="text-sm font-semibold text-white">{s.name}</h4>
                          <p className="text-xs text-slate-400">
                            {s.session_date} · {s.sets.length} series
                          </p>
                          {s.fatigue_notes && (
                            <p className="mt-1 text-xs text-amber-300/90">{s.fatigue_notes}</p>
                          )}
                        </div>
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => startEditingSession(s)}
                            className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-500"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDeleteSession(s.id)}
                            className="rounded-lg border border-rose-500/40 px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-950/60"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          )}

          {/* TAB 3: MESOCYCLES BUILDER, EDITOR & ACTIVATION */}
          {activeTab === "mesocycles" && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                <h2 className="text-sm font-bold text-white">Diseñar Mesociclo con el Coach</h2>
                <p className="text-xs text-slate-400">
                  El Coach genera un borrador respetando tu Perfil Vivo, equipamiento, lesiones
                  activas y la Base de Conocimiento aprobada.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    value={coachFocus}
                    onChange={(e) => setCoachFocus(e.target.value)}
                    placeholder="Enfoque opcional (ej. priorizar espalda y brazos)"
                    className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                  />
                  <button
                    type="button"
                    disabled={draftingWithCoach}
                    onClick={() => void handleDraftWithCoach()}
                    className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    {draftingWithCoach ? "Generando…" : "Generar borrador con Coach"}
                  </button>
                </div>
              </div>

              {editingMesoId && (
                <form
                  onSubmit={handleSaveMesocycleEdit}
                  className="space-y-3 rounded-2xl border border-emerald-500/40 bg-slate-900 p-4"
                >
                  <h3 className="text-sm font-bold text-emerald-300">Editar Mesociclo</h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <label className="block text-xs text-slate-300">
                      Nombre del Mesociclo
                      <input
                        type="text"
                        value={editMesoName}
                        onChange={(e) => setEditMesoName(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                        required
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      Objetivo
                      <input
                        type="text"
                        value={editMesoGoal}
                        onChange={(e) => setEditMesoGoal(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                        required
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      Duración (semanas)
                      <input
                        type="number"
                        min={2}
                        max={16}
                        value={editMesoWeeks}
                        onChange={(e) => setEditMesoWeeks(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white"
                        required
                      />
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-semibold text-slate-950"
                    >
                      Guardar cambios
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingMesoId(null)}
                      className="rounded-lg border border-slate-700 px-3.5 py-2 text-xs text-slate-300"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              )}

              <div className="space-y-3">
                {mesocycles.map((m) => (
                  <article
                    key={m.id}
                    className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                          {statusBadgeLabel(m.status)}
                        </span>
                        <h3 className="mt-1 text-sm font-bold text-white">{m.name}</h3>
                        <p className="text-xs text-slate-400">
                          {m.goal} · {m.duration_weeks} semanas · {m.planned_sessions.length} días/sem
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => startEditingMesocycle(m)}
                          className="rounded-lg border border-slate-700 px-2.5 py-1 text-xs text-slate-200 hover:border-slate-500"
                        >
                          Editar
                        </button>
                        {m.status === "draft" && (
                          <button
                            type="button"
                            onClick={() => void handleActivateMesocycle(m)}
                            className="rounded-lg bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-slate-950"
                          >
                            Activar Mesociclo
                          </button>
                        )}
                        {m.status === "active" && (
                          <button
                            type="button"
                            onClick={() => void handleTransitionStatus(m.id, "deload")}
                            className="rounded-lg border border-amber-500/50 px-2.5 py-1 text-xs text-amber-300"
                          >
                            Pasar a descarga
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: WEEKLY EFFECTIVE VOLUME & DELOAD */}
          {activeTab === "volume" && volumeSummary && (
            <div className="space-y-4">
              <div
                className={`rounded-2xl border p-4 ${
                  volumeSummary.deload_assessment.recommended
                    ? "border-amber-500/50 bg-amber-950/30"
                    : "border-slate-800 bg-slate-900/70"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">Evaluación de Descarga (Deload)</h2>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      volumeSummary.deload_assessment.recommended
                        ? "bg-amber-500/20 text-amber-300"
                        : "bg-emerald-500/20 text-emerald-300"
                    }`}
                  >
                    {volumeSummary.deload_assessment.recommended
                      ? "Descarga recomendada"
                      : volumeSummary.deload_assessment.status === "watch"
                        ? "Vigilar fatiga"
                        : "Sin necesidad de descarga"}
                  </span>
                </div>
                {volumeSummary.deload_assessment.reasons_es.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-200">
                    {volumeSummary.deload_assessment.reasons_es.map((reason, idx) => (
                      <li key={idx}>{reason}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    Rendimiento y fatiga dentro de rangos sostenibles.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Volumen semanal efectivo ({volumeSummary.week_start} a {volumeSummary.week_end})
                  </h3>
                  <p className="text-xs text-slate-400">
                    {volumeSummary.total_sessions} sesiones · {volumeSummary.total_effective_sets}{" "}
                    series efectivas totales (directas = 1.0, secundarias = 0.5)
                  </p>
                </div>

                {volumeSummary.by_muscle_group.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    Registra Sesiones de Entrenamiento esta semana para ver el desglose por grupo
                    muscular.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {volumeSummary.by_muscle_group.map((mg) => (
                      <div
                        key={mg.muscle_group}
                        className="flex items-center justify-between rounded-xl bg-slate-950/60 px-3 py-2 text-xs"
                      >
                        <div>
                          <p className="font-semibold capitalize text-white">{mg.muscle_group}</p>
                          <p className="text-[11px] text-slate-400">
                            Directas: {mg.direct_sets} · Secundarias: {mg.secondary_sets}
                            {mg.average_rir !== null && mg.average_rir !== undefined
                              ? ` · RIR medio: ${mg.average_rir}`
                              : ""}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-emerald-300">
                            {mg.effective_sets} efectivas
                          </p>
                          {mg.planned_sets > 0 && (
                            <p className="text-[11px] text-slate-400">
                              Objetivo: {mg.planned_sets}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmation Modal for Single Active Mesocycle Invariant */}
      {conflictModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar cambio de Mesociclo activo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4"
        >
          <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-700 bg-slate-900 p-5">
            <h2 className="text-base font-bold text-white">Confirmar cambio de Mesociclo activo</h2>
            <p className="text-xs text-slate-300">
              Actualmente tienes activo <strong>{conflictModal.activeMesocycleName}</strong>. Para
              activar <strong>{conflictModal.targetMesocycleName}</strong>, elige qué hacer con el
              Mesociclo anterior:
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  const target = mesocycles.find((m) => m.id === conflictModal.targetMesocycleId);
                  if (target) void handleActivateMesocycle(target, "completed");
                }}
                className="rounded-xl bg-emerald-500 py-2 text-xs font-semibold text-slate-950"
              >
                Completar anterior y activar
              </button>
              <button
                type="button"
                onClick={() => {
                  const target = mesocycles.find((m) => m.id === conflictModal.targetMesocycleId);
                  if (target) void handleActivateMesocycle(target, "archived");
                }}
                className="rounded-xl border border-slate-600 py-2 text-xs font-semibold text-slate-200"
              >
                Archivar anterior y activar
              </button>
              <button
                type="button"
                onClick={() => setConflictModal(null)}
                className="rounded-xl py-2 text-xs text-slate-400"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
