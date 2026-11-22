import { type FormEvent, useEffect, useState } from "react";
import { apiClient, DuplicateSubmissionError } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { PageHeader } from "../../ui/PageHeader";
import { ActivePhasePanel, type PhaseFormState } from "./ActivePhasePanel";
import { CoachAdjustmentCard } from "./CoachAdjustmentCard";
import {
  type NutritionPhaseResponse,
  type WeeklyCheckInResponse,
  createIdempotencyKey,
} from "./labels";
import { NutritionHistorySection } from "./NutritionHistorySection";
import { WeeklyCheckInForm, type CheckInFormState } from "./WeeklyCheckInForm";

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
        { params: { path: { checkin_id: checkinId } } },
      );
      if (apiError || !data) {
        setError("No se pudo aplicar la propuesta de ajuste.");
        return;
      }
      setCheckins((prev) => prev.map((item) => (item.id === checkinId ? data.checkin : item)));
      setPhases((prev) => prev.map((p) => (p.id === data.phase.id ? data.phase : p)));
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
        { params: { path: { checkin_id: checkinId } } },
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
      <section className="space-y-4">
        <PageHeader
          title="Nutrición"
          description="Gestiona tu Fase Nutricional activa, registra tu Check-in semanal y revisa las propuestas de ajuste del Coach."
        />
        <p className="text-sm text-ink-muted">Cargando Fase Nutricional y Check-ins…</p>
      </section>
    );
  }

  return (
    <section className="space-y-6 pb-8">
      <PageHeader
        title="Nutrición"
        description="Gestiona tu Fase Nutricional activa, registra tu Check-in semanal y revisa las propuestas de ajuste del Coach."
      />

      {/* Quick anchor strip on mobile */}
      <div className="flex flex-wrap gap-2 lg:hidden">
        <a
          href="#fase-activa"
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
        >
          Fase activa
        </a>
        {latestCheckIn && (
          <a
            href="#ajuste-coach"
            className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
          >
            Ajuste del Coach
          </a>
        )}
        <a
          href="#checkin-semanal"
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
        >
          Check-in semanal
        </a>
        <a
          href="#historial-nutricion"
          className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted hover:text-ink"
        >
          Historial
        </a>
      </div>

      {error && <AlertBanner tone="error">{error}</AlertBanner>}
      {statusMessage && <AlertBanner tone="success">{statusMessage}</AlertBanner>}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div className="lg:col-span-5">
          <ActivePhasePanel
            activePhase={activePhase}
            phaseForm={phaseForm}
            phaseMode={phaseMode}
            savingPhase={savingPhase}
            onChangeForm={(patch) => setPhaseForm((prev) => ({ ...prev, ...patch }))}
            onToggleMode={() => {
              if (!activePhase) return;
              if (phaseMode === "edit") {
                setPhaseMode("create");
                setPhaseForm(createEmptyPhaseForm());
              } else {
                setPhaseMode("edit");
                setPhaseForm(phaseToForm(activePhase));
              }
            }}
            onCompletePhase={() => void handleCompleteActivePhase()}
            onSubmit={(e) => void handleSavePhase(e)}
          />
        </div>

        <div className="space-y-6 lg:col-span-7">
          {latestCheckIn && (
            <CoachAdjustmentCard
              latestCheckIn={latestCheckIn}
              resolvingAdjustmentId={resolvingAdjustmentId}
              onApply={(id) => void handleApplyAdjustment(id)}
              onDismiss={(id) => void handleDismissAdjustment(id)}
            />
          )}

          <WeeklyCheckInForm
            form={checkinForm}
            submitting={submittingCheckIn}
            onChange={(patch) => setCheckinForm((prev) => ({ ...prev, ...patch }))}
            onSubmit={(e) => void handleSubmitCheckIn(e)}
          />
        </div>
      </div>

      <NutritionHistorySection checkins={checkins} completedPhases={completedPhases} />
    </section>
  );
}
