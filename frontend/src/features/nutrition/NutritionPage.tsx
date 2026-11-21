import { type FormEvent, useEffect, useState } from "react";
import { apiClient, DuplicateSubmissionError } from "../../api/client";
import {
  ADJUSTMENT_STATUS_LABELS,
  type NutritionPhaseResponse,
  type NutritionPhaseType,
  PHASE_TYPE_LABELS,
  TREND_STATUS_LABELS,
  type WeeklyCheckInResponse,
  createIdempotencyKey,
} from "./labels";

interface PhaseFormState {
  phase_type: NutritionPhaseType;
  start_date: string;
  target_calories: string;
  protein_g: string;
  fat_g: string;
  carbs_g: string;
  target_weekly_weight_change_kg: string;
  notes: string;
}

interface CheckInFormState {
  checkin_date: string;
  average_weight_kg: string;
  daily_weights_raw: string;
  waist_cm: string;
  chest_cm: string;
  adherence_score: string;
  sleep_quality: string;
  energy_level: string;
  hunger_level: string;
  recovery_score: string;
  perceived_fatigue: string;
  performance_notes: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function createEmptyPhaseForm(): PhaseFormState {
  return {
    phase_type: "cut",
    start_date: todayIso(),
    target_calories: "2400",
    protein_g: "180",
    fat_g: "65",
    carbs_g: "270",
    target_weekly_weight_change_kg: "-0.4",
    notes: "",
  };
}

function phaseToForm(phase: NutritionPhaseResponse): PhaseFormState {
  return {
    phase_type: phase.phase_type,
    start_date: phase.start_date,
    target_calories: String(phase.target_calories),
    protein_g: String(phase.protein_g),
    fat_g: String(phase.fat_g),
    carbs_g: String(phase.carbs_g),
    target_weekly_weight_change_kg: String(phase.target_weekly_weight_change_kg),
    notes: phase.notes ?? "",
  };
}

function createEmptyCheckInForm(): CheckInFormState {
  return {
    checkin_date: todayIso(),
    average_weight_kg: "",
    daily_weights_raw: "",
    waist_cm: "",
    chest_cm: "",
    adherence_score: "8",
    sleep_quality: "7",
    energy_level: "7",
    hunger_level: "5",
    recovery_score: "7",
    perceived_fatigue: "5",
    performance_notes: "",
  };
}

function parseNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

export function NutritionPage() {
  const [phases, setPhases] = useState<NutritionPhaseResponse[]>([]);
  const [checkins, setCheckins] = useState<WeeklyCheckInResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [phaseForm, setPhaseForm] = useState<PhaseFormState>(createEmptyPhaseForm);
  const [phaseMode, setPhaseMode] = useState<"create" | "edit">("create");
  const [savingPhase, setSavingPhase] = useState(false);

  const [checkinForm, setCheckinForm] = useState<CheckInFormState>(createEmptyCheckInForm);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(createIdempotencyKey);
  const [submittingCheckIn, setSubmittingCheckIn] = useState(false);
  const [resolvingAdjustmentId, setResolvingAdjustmentId] = useState<string | null>(null);

  const activePhase = phases.find((p) => p.status === "active") ?? null;
  const completedPhases = phases.filter((p) => p.status === "completed");
  const latestCheckIn = checkins[0] ?? null;

  useEffect(() => {
    let mounted = true;
    async function loadAll() {
      setLoading(true);
      setError(null);
      try {
        const [phasesRes, checkinsRes] = await Promise.all([
          apiClient.GET("/api/v1/nutrition/phases"),
          apiClient.GET("/api/v1/nutrition/checkins"),
        ]);
        if (!mounted) return;
        if (phasesRes.error || !phasesRes.data) {
          setError("No se pudo cargar tu Fase Nutricional.");
          return;
        }
        setPhases(phasesRes.data);
        const currentActive = phasesRes.data.find((p) => p.status === "active");
        if (currentActive) {
          setPhaseForm(phaseToForm(currentActive));
          setPhaseMode("edit");
        } else {
          setPhaseMode("create");
        }
        if (checkinsRes.data) {
          setCheckins(checkinsRes.data);
        }
      } catch {
        if (mounted) setError("Error al conectar con el servicio de Nutrición.");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    void loadAll();
    return () => {
      mounted = false;
    };
  }, []);

  async function refreshPhases() {
    const { data } = await apiClient.GET("/api/v1/nutrition/phases");
    if (data) {
      setPhases(data);
      const currentActive = data.find((p) => p.status === "active");
      if (currentActive) {
        setPhaseForm(phaseToForm(currentActive));
        setPhaseMode("edit");
      } else {
        setPhaseMode("create");
      }
    }
  }

  async function handleSavePhase(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);

    const calories = Math.round(parseNumber(phaseForm.target_calories));
    const protein = Math.round(parseNumber(phaseForm.protein_g));
    const fat = Math.round(parseNumber(phaseForm.fat_g));
    const carbs = Math.round(parseNumber(phaseForm.carbs_g));
    const weeklyRate = parseNumber(phaseForm.target_weekly_weight_change_kg);

    if (!Number.isFinite(calories) || calories < 1000 || calories > 8000) {
      setError("Las calorías objetivo deben estar entre 1000 y 8000 kcal.");
      return;
    }
    if (!Number.isFinite(weeklyRate) || weeklyRate < -2 || weeklyRate > 2) {
      setError("El ritmo semanal objetivo debe estar entre -2.0 y +2.0 kg.");
      return;
    }

    setSavingPhase(true);
    try {
      if (phaseMode === "edit" && activePhase) {
        const { data, error: apiError } = await apiClient.PATCH(
          "/api/v1/nutrition/phases/{phase_id}",
          {
            params: { path: { phase_id: activePhase.id } },
            body: {
              phase_type: phaseForm.phase_type,
              target_calories: calories,
              protein_g: protein,
              fat_g: fat,
              carbs_g: carbs,
              target_weekly_weight_change_kg: weeklyRate,
              notes: phaseForm.notes.trim() || null,
            },
          },
        );
        if (apiError || !data) {
          setError("No se pudo actualizar la Fase Nutricional activa.");
          return;
        }
        await refreshPhases();
        setStatusMessage("Fase Nutricional actualizada correctamente.");
      } else {
        const { data, error: apiError } = await apiClient.POST("/api/v1/nutrition/phases", {
          body: {
            phase_type: phaseForm.phase_type,
            start_date: phaseForm.start_date || todayIso(),
            target_calories: calories,
            protein_g: protein,
            fat_g: fat,
            carbs_g: carbs,
            target_weekly_weight_change_kg: weeklyRate,
            notes: phaseForm.notes.trim() || null,
          },
        });
        if (apiError || !data) {
          setError("No se pudo activar la nueva Fase Nutricional.");
          return;
        }
        await refreshPhases();
        setStatusMessage("Fase Nutricional activada correctamente.");
      }
    } catch (err) {
      if (err instanceof DuplicateSubmissionError) {
        setError(err.message);
      } else {
        setError("Error de red al guardar la Fase Nutricional.");
      }
    } finally {
      setSavingPhase(false);
    }
  }

  async function handleCompleteActivePhase() {
    if (!activePhase) return;
    setError(null);
    setStatusMessage(null);
    setSavingPhase(true);
    try {
      const { data, error: apiError } = await apiClient.POST(
        "/api/v1/nutrition/phases/{phase_id}/complete",
        {
          params: { path: { phase_id: activePhase.id } },
          body: { end_date: todayIso() },
        },
      );
      if (apiError || !data) {
        setError("No se pudo finalizar la Fase Nutricional.");
        return;
      }
      await refreshPhases();
      setPhaseForm(createEmptyPhaseForm());
      setStatusMessage("Fase Nutricional finalizada y movida al historial.");
    } finally {
      setSavingPhase(false);
    }
  }

  async function handleSubmitCheckIn(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setStatusMessage(null);

    const dailyWeights = checkinForm.daily_weights_raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(parseNumber)
      .filter((n) => Number.isFinite(n));

    const avgWeight = checkinForm.average_weight_kg.trim()
      ? parseNumber(checkinForm.average_weight_kg)
      : null;

    if (dailyWeights.length === 0 && (avgWeight === null || !Number.isFinite(avgWeight))) {
      setError("Introduce tu peso medio semanal o al menos una lectura diaria.");
      return;
    }

    const measurements: Record<string, number> = {};
    if (checkinForm.waist_cm.trim()) {
      const w = parseNumber(checkinForm.waist_cm);
      if (Number.isFinite(w) && w > 0) measurements.waist_cm = w;
    }
    if (checkinForm.chest_cm.trim()) {
      const c = parseNumber(checkinForm.chest_cm);
      if (Number.isFinite(c) && c > 0) measurements.chest_cm = c;
    }

    setSubmittingCheckIn(true);
    try {
      const { data, error: apiError } = await apiClient.POST("/api/v1/nutrition/checkins", {
        body: {
          checkin_date: checkinForm.checkin_date || todayIso(),
          idempotency_key: idempotencyKey,
          average_weight_kg: dailyWeights.length > 0 ? null : avgWeight,
          daily_weights: dailyWeights.length > 0 ? dailyWeights : null,
          body_measurements: Object.keys(measurements).length > 0 ? measurements : null,
          adherence_score: Math.round(parseNumber(checkinForm.adherence_score)),
          sleep_quality: Math.round(parseNumber(checkinForm.sleep_quality)),
          energy_level: Math.round(parseNumber(checkinForm.energy_level)),
          hunger_level: checkinForm.hunger_level.trim()
            ? Math.round(parseNumber(checkinForm.hunger_level))
            : null,
          recovery_score: checkinForm.recovery_score.trim()
            ? Math.round(parseNumber(checkinForm.recovery_score))
            : null,
          perceived_fatigue: Math.round(parseNumber(checkinForm.perceived_fatigue)),
          performance_notes: checkinForm.performance_notes.trim() || null,
        },
      });
      if (apiError || !data) {
        setError("No se pudo registrar el Check-in semanal.");
        return;
      }

      setCheckins((prev) => [data, ...prev.filter((item) => item.id !== data.id)]);
      setCheckinForm(createEmptyCheckInForm());
      setIdempotencyKey(createIdempotencyKey());
      setStatusMessage("Check-in semanal registrado y analizado por el Coach.");
    } catch (err) {
      if (err instanceof DuplicateSubmissionError) {
        setError(err.message);
      } else {
        setError("Error de red al enviar el Check-in semanal.");
      }
    } finally {
      setSubmittingCheckIn(false);
    }
  }

  async function handleApplyAdjustment(checkinId: string) {
    setError(null);
    setStatusMessage(null);
    setResolvingAdjustmentId(checkinId);
    try {
      const { data, error: apiError } = await apiClient.POST(
        "/api/v1/nutrition/checkins/{checkin_id}/apply-adjustment",
        {
          params: { path: { checkin_id: checkinId } },
        },
      );
      if (apiError || !data) {
        setError("No se pudo aplicar la propuesta de ajuste.");
        return;
      }
      setCheckins((prev) =>
        prev.map((item) => (item.id === checkinId ? data.checkin : item)),
      );
      setPhases((prev) =>
        prev.map((p) => (p.id === data.phase.id ? data.phase : p)),
      );
      setPhaseForm(phaseToForm(data.phase));
      setStatusMessage("Ajuste aplicado a tu Fase Nutricional activa.");
    } finally {
      setResolvingAdjustmentId(null);
    }
  }

  async function handleDismissAdjustment(checkinId: string) {
    setError(null);
    setStatusMessage(null);
    setResolvingAdjustmentId(checkinId);
    try {
      const { data, error: apiError } = await apiClient.POST(
        "/api/v1/nutrition/checkins/{checkin_id}/dismiss-adjustment",
        {
          params: { path: { checkin_id: checkinId } },
        },
      );
      if (apiError || !data) {
        setError("No se pudo descartar la propuesta.");
        return;
      }
      setCheckins((prev) => prev.map((item) => (item.id === checkinId ? data : item)));
      setStatusMessage("Propuesta descartada. Tu Fase Nutricional permanece sin cambios.");
    } finally {
      setResolvingAdjustmentId(null);
    }
  }

  if (loading) {
    return (
      <section className="space-y-2">
        <h1 className="text-xl font-bold text-white">Nutrición</h1>
        <p className="text-sm text-slate-400">Cargando Fase Nutricional y Check-ins…</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-8">
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-white">Nutrición</h1>
        <p className="text-sm text-slate-400">
          Gestiona tu Fase Nutricional activa, registra tu Check-in semanal y revisa las propuestas
          de ajuste del Coach.
        </p>
      </header>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-4 py-3 text-sm text-rose-200"
        >
          {error}
        </div>
      )}

      {statusMessage && (
        <div
          role="status"
          className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
        >
          {statusMessage}
        </div>
      )}

      {/* 1. Active Nutrition Phase Summary & Editor */}
      <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">Fase Nutricional activa</h2>
            {activePhase ? (
              <p className="text-xs text-emerald-400">
                {PHASE_TYPE_LABELS[activePhase.phase_type]} · Desde {activePhase.start_date}
              </p>
            ) : (
              <p className="text-xs text-slate-400">
                No tienes una Fase Nutricional activa. Configura una para guiar al Coach.
              </p>
            )}
          </div>
          {activePhase && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (phaseMode === "edit") {
                    setPhaseMode("create");
                    setPhaseForm(createEmptyPhaseForm());
                  } else {
                    setPhaseMode("edit");
                    setPhaseForm(phaseToForm(activePhase));
                  }
                }}
                className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-500"
              >
                {phaseMode === "edit" ? "Nueva fase" : "Editar actual"}
              </button>
              <button
                type="button"
                disabled={savingPhase}
                onClick={handleCompleteActivePhase}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-500/20 disabled:opacity-50"
              >
                Finalizar fase
              </button>
            </div>
          )}
        </div>

        {activePhase && (
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3 sm:grid-cols-5">
            <div>
              <p className="text-[11px] text-slate-400">Objetivo</p>
              <p className="text-sm font-bold text-white">{activePhase.target_calories} kcal</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Proteína</p>
              <p className="text-sm font-semibold text-emerald-300">{activePhase.protein_g} g</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Grasas</p>
              <p className="text-sm font-semibold text-amber-300">{activePhase.fat_g} g</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Carbohidratos</p>
              <p className="text-sm font-semibold text-sky-300">{activePhase.carbs_g} g</p>
            </div>
            <div>
              <p className="text-[11px] text-slate-400">Ritmo semanal</p>
              <p className="text-sm font-semibold text-white">
                {activePhase.target_weekly_weight_change_kg > 0 ? "+" : ""}
                {activePhase.target_weekly_weight_change_kg} kg/sem
              </p>
            </div>
          </div>
        )}

        <form onSubmit={handleSavePhase} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-xs text-slate-300">
              <span>Tipo de fase</span>
              <select
                value={phaseForm.phase_type}
                onChange={(e) =>
                  setPhaseForm((prev) => ({
                    ...prev,
                    phase_type: e.target.value as NutritionPhaseType,
                  }))
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              >
                <option value="bulk">Volumen</option>
                <option value="cut">Definición</option>
                <option value="maintenance">Mantenimiento</option>
                <option value="mini_cut">Mini-cut</option>
              </select>
            </label>

            <label className="block space-y-1 text-xs text-slate-300">
              <span>Ritmo semanal objetivo (kg/sem)</span>
              <input
                type="number"
                step="0.05"
                value={phaseForm.target_weekly_weight_change_kg}
                onChange={(e) =>
                  setPhaseForm((prev) => ({
                    ...prev,
                    target_weekly_weight_change_kg: e.target.value,
                  }))
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="block space-y-1 text-xs text-slate-300">
              <span>Calorías objetivo (kcal)</span>
              <input
                type="number"
                value={phaseForm.target_calories}
                onChange={(e) =>
                  setPhaseForm((prev) => ({ ...prev, target_calories: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block space-y-1 text-xs text-slate-300">
              <span>Proteína (g)</span>
              <input
                type="number"
                value={phaseForm.protein_g}
                onChange={(e) =>
                  setPhaseForm((prev) => ({ ...prev, protein_g: e.target.value }))
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block space-y-1 text-xs text-slate-300">
              <span>Grasas (g)</span>
              <input
                type="number"
                value={phaseForm.fat_g}
                onChange={(e) => setPhaseForm((prev) => ({ ...prev, fat_g: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>

            <label className="block space-y-1 text-xs text-slate-300">
              <span>Carbohidratos (g)</span>
              <input
                type="number"
                value={phaseForm.carbs_g}
                onChange={(e) => setPhaseForm((prev) => ({ ...prev, carbs_g: e.target.value }))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
              />
            </label>
          </div>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>Notas de la fase (opcional)</span>
            <input
              type="text"
              value={phaseForm.notes}
              onChange={(e) => setPhaseForm((prev) => ({ ...prev, notes: e.target.value }))}
              placeholder="Ej. 4 comidas al día, mayor carga de HC peri-entreno"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <button
            type="submit"
            disabled={savingPhase}
            className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {savingPhase
              ? "Guardando…"
              : phaseMode === "edit" && activePhase
                ? "Guardar cambios de fase"
                : "Activar Fase Nutricional"}
          </button>
        </form>
      </div>

      {/* 2. Latest Weight Trend & Coach Adjustment Proposal Card */}
      {latestCheckIn && (
        <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-white">
              Análisis y propuesta de ajuste del Coach
            </h2>
            <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-emerald-300">
              {ADJUSTMENT_STATUS_LABELS[latestCheckIn.adjustment_status]}
            </span>
          </div>

          {latestCheckIn.weight_trend && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-950/70 p-3 text-xs sm:grid-cols-3">
              <div>
                <p className="text-slate-400">Tendencia real</p>
                <p className="font-semibold text-white">
                  {latestCheckIn.weight_trend.actual_weekly_change_kg !== null
                    ? `${latestCheckIn.weight_trend.actual_weekly_change_kg > 0 ? "+" : ""}${latestCheckIn.weight_trend.actual_weekly_change_kg} kg/sem`
                    : "Primer registro"}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Estado</p>
                <p className="font-semibold text-emerald-300">
                  {TREND_STATUS_LABELS[latestCheckIn.weight_trend.trend_status] ??
                    latestCheckIn.weight_trend.trend_status}
                </p>
              </div>
              <div>
                <p className="text-slate-400">Delta TDEE estimado</p>
                <p className="font-semibold text-white">
                  {latestCheckIn.estimated_tdee_delta_kcal !== null
                    ? `${latestCheckIn.estimated_tdee_delta_kcal > 0 ? "+" : ""}${latestCheckIn.estimated_tdee_delta_kcal} kcal/día`
                    : "N/D"}
                </p>
              </div>
            </div>
          )}

          <p className="text-sm text-slate-200">
            {latestCheckIn.coach_recommendations.summary_es}
          </p>

          {latestCheckIn.coach_recommendations.training_adjustment_es && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
              <p className="font-semibold">Ajuste de entrenamiento sugerido:</p>
              <p>{latestCheckIn.coach_recommendations.training_adjustment_es}</p>
            </div>
          )}

          {latestCheckIn.coach_recommendations.proposed_target_calories !== null &&
            latestCheckIn.coach_recommendations.calorie_delta_kcal !== 0 && (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300">
                <p className="font-semibold text-white">
                  Objetivos propuestos:{" "}
                  {latestCheckIn.coach_recommendations.proposed_target_calories} kcal (
                  {latestCheckIn.coach_recommendations.calorie_delta_kcal > 0 ? "+" : ""}
                  {latestCheckIn.coach_recommendations.calorie_delta_kcal} kcal)
                </p>
                <p className="mt-1">
                  Proteína {latestCheckIn.coach_recommendations.proposed_protein_g} g · Grasas{" "}
                  {latestCheckIn.coach_recommendations.proposed_fat_g} g · Carbohidratos{" "}
                  {latestCheckIn.coach_recommendations.proposed_carbs_g} g
                </p>
              </div>
            )}

          {latestCheckIn.adjustment_status === "proposed" && (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                disabled={resolvingAdjustmentId === latestCheckIn.id}
                onClick={() => handleApplyAdjustment(latestCheckIn.id)}
                className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
              >
                Aplicar ajuste
              </button>
              <button
                type="button"
                disabled={resolvingAdjustmentId === latestCheckIn.id}
                onClick={() => handleDismissAdjustment(latestCheckIn.id)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 hover:border-slate-500 disabled:opacity-50"
              >
                Descartar
              </button>
            </div>
          )}
        </div>
      )}

      {/* 3. Guided Weekly Check-in Form */}
      <form
        onSubmit={handleSubmitCheckIn}
        className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
      >
        <div>
          <h2 className="text-base font-semibold text-white">Check-in semanal guiado</h2>
          <p className="text-xs text-slate-400">
            Registra tu peso corporal, sensaciones y rendimiento para que el Coach evalúe tu
            tendencia.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs text-slate-300">
            <span>Peso medio semanal (kg)</span>
            <input
              type="number"
              step="0.05"
              value={checkinForm.average_weight_kg}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, average_weight_kg: e.target.value }))
              }
              placeholder="Ej. 81.9"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>O lecturas diarias separadas por coma (kg)</span>
            <input
              type="text"
              value={checkinForm.daily_weights_raw}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, daily_weights_raw: e.target.value }))
              }
              placeholder="Ej. 82.1, 81.9, 81.8"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-xs text-slate-300">
            <span>Cintura (cm, opcional)</span>
            <input
              type="number"
              step="0.1"
              value={checkinForm.waist_cm}
              onChange={(e) => setCheckinForm((prev) => ({ ...prev, waist_cm: e.target.value }))}
              placeholder="Ej. 84.5"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>Pecho (cm, opcional)</span>
            <input
              type="number"
              step="0.1"
              value={checkinForm.chest_cm}
              onChange={(e) => setCheckinForm((prev) => ({ ...prev, chest_cm: e.target.value }))}
              placeholder="Ej. 104.0"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-xs text-slate-300">
            <span>Adherencia (1-10)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={checkinForm.adherence_score}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, adherence_score: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>Calidad de sueño (1-10)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={checkinForm.sleep_quality}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, sleep_quality: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>Energía (1-10)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={checkinForm.energy_level}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, energy_level: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>Hambre (1-10)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={checkinForm.hunger_level}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, hunger_level: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>Recuperación (1-10)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={checkinForm.recovery_score}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, recovery_score: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>

          <label className="block space-y-1 text-xs text-slate-300">
            <span>Fatiga percibida (1-10)</span>
            <input
              type="number"
              min={1}
              max={10}
              value={checkinForm.perceived_fatigue}
              onChange={(e) =>
                setCheckinForm((prev) => ({ ...prev, perceived_fatigue: e.target.value }))
              }
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs text-slate-300">
          <span>Notas de rendimiento y sensaciones</span>
          <textarea
            rows={2}
            value={checkinForm.performance_notes}
            onChange={(e) =>
              setCheckinForm((prev) => ({ ...prev, performance_notes: e.target.value }))
            }
            placeholder="Ej. Cargas estables en press banca, ligera fatiga lumbar el viernes"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          />
        </label>

        <button
          type="submit"
          disabled={submittingCheckIn}
          className="w-full rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {submittingCheckIn ? "Analizando Check-in…" : "Enviar Check-in semanal"}
        </button>
      </form>

      {/* 4. Chronological Check-in History */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-base font-semibold text-white">Historial de Check-ins</h2>
        {checkins.length === 0 ? (
          <p className="text-xs text-slate-400">Todavía no has registrado ningún Check-in.</p>
        ) : (
          <ul className="space-y-2">
            {checkins.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    {item.checkin_date} · {item.average_weight_kg} kg
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Adherencia {item.adherence_score}/10 · Fatiga {item.perceived_fatigue}/10
                  </span>
                </div>
                {item.performance_notes && (
                  <p className="mt-1 text-slate-400">{item.performance_notes}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 5. Past Nutrition Phases History */}
      <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
        <h2 className="text-base font-semibold text-white">Historial de Fases Nutricionales</h2>
        {completedPhases.length === 0 ? (
          <p className="text-xs text-slate-400">No hay Fases Nutricionales finalizadas aún.</p>
        ) : (
          <ul className="space-y-2">
            {completedPhases.map((phase) => (
              <li
                key={phase.id}
                className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs text-slate-300"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-white">
                    {PHASE_TYPE_LABELS[phase.phase_type]} · {phase.target_calories} kcal
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {phase.start_date} → {phase.end_date ?? "—"}
                  </span>
                </div>
                <p className="mt-1 text-slate-400">
                  P {phase.protein_g} g · G {phase.fat_g} g · HC {phase.carbs_g} g · Ritmo{" "}
                  {phase.target_weekly_weight_change_kg > 0 ? "+" : ""}
                  {phase.target_weekly_weight_change_kg} kg/sem
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
