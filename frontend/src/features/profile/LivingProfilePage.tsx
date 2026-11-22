import { type FormEvent, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { Input, Select, Textarea } from "../../ui/Field";
import { PageHeader } from "../../ui/PageHeader";
import { Surface } from "../../ui/Surface";
import { ActiveCoachContextBanner } from "./ActiveCoachContextBanner";
import { InjuriesSection } from "./InjuriesSection";
import {
  APPROACH_LABELS,
  type BiologicalSex,
  EXPERIENCE_LABELS,
  type ExperienceLevel,
  GOAL_LABELS,
  type InjuryResponse,
  type LivingProfileResponse,
  type PrimaryGoal,
  SEX_LABELS,
  type TrainingApproach,
  parseTagInput,
} from "./labels";

interface ProfileFormState {
  age: string;
  sex: BiologicalSex | "";
  height_cm: string;
  base_weight_kg: string;
  experience_level: ExperienceLevel | "";
  primary_goal: PrimaryGoal | "";
  training_days_per_week: string;
  session_duration_min: string;
  equipment: string;
  allergies: string;
  food_preferences: string;
  training_approach: TrainingApproach;
  notes: string;
}

type FieldErrorKey =
  | "age"
  | "height_cm"
  | "base_weight_kg"
  | "training_days_per_week"
  | "session_duration_min";

function toFormState(profile: LivingProfileResponse): ProfileFormState {
  return {
    age: profile.age !== null ? String(profile.age) : "",
    sex: profile.sex ?? "",
    height_cm: profile.height_cm !== null ? String(profile.height_cm) : "",
    base_weight_kg: profile.base_weight_kg !== null ? String(profile.base_weight_kg) : "",
    experience_level: profile.experience_level ?? "",
    primary_goal: profile.primary_goal ?? "",
    training_days_per_week:
      profile.training_days_per_week !== null ? String(profile.training_days_per_week) : "",
    session_duration_min:
      profile.session_duration_min !== null ? String(profile.session_duration_min) : "",
    equipment: profile.equipment.join(", "),
    allergies: profile.allergies.join(", "),
    food_preferences: profile.food_preferences.join(", "),
    training_approach: profile.training_approach,
    notes: profile.notes ?? "",
  };
}

function parseOptionalInt(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : Number.NaN;
}

function parseOptionalFloat(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function validateForm(form: ProfileFormState): { field: FieldErrorKey; message: string } | null {
  const age = parseOptionalInt(form.age);
  if (age !== null && (Number.isNaN(age) || age < 14 || age > 100)) {
    return { field: "age", message: "La edad debe estar entre 14 y 100 años." };
  }

  const height = parseOptionalFloat(form.height_cm);
  if (height !== null && (Number.isNaN(height) || height < 100 || height > 250)) {
    return { field: "height_cm", message: "La altura debe estar entre 100 y 250 cm." };
  }

  const weight = parseOptionalFloat(form.base_weight_kg);
  if (weight !== null && (Number.isNaN(weight) || weight < 30 || weight > 250)) {
    return { field: "base_weight_kg", message: "El peso base debe estar entre 30 y 250 kg." };
  }

  const days = parseOptionalInt(form.training_days_per_week);
  if (days !== null && (Number.isNaN(days) || days < 1 || days > 7)) {
    return {
      field: "training_days_per_week",
      message: "Los días de entrenamiento por semana deben estar entre 1 y 7.",
    };
  }

  const duration = parseOptionalInt(form.session_duration_min);
  if (duration !== null && (Number.isNaN(duration) || duration < 15 || duration > 240)) {
    return {
      field: "session_duration_min",
      message: "La duración de cada sesión debe estar entre 15 y 240 minutos.",
    };
  }

  return null;
}

export function LivingProfilePage() {
  const [profile, setProfile] = useState<LivingProfileResponse | null>(null);
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invalidField, setInvalidField] = useState<FieldErrorKey | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const errorBannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (error && errorBannerRef.current && typeof errorBannerRef.current.scrollIntoView === "function") {
      errorBannerRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [error]);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const { data, error: apiError } = await apiClient.GET("/api/v1/profile");
        if (!active) return;
        if (apiError || !data) {
          setError("No se pudo cargar tu Perfil Vivo.");
          return;
        }
        setProfile(data);
        setForm(toFormState(data));
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadProfile();
    return () => {
      active = false;
    };
  }, []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;

    setError(null);
    setInvalidField(null);
    setSuccessMessage(null);

    const validationError = validateForm(form);
    if (validationError) {
      setError(validationError.message);
      setInvalidField(validationError.field);
      return;
    }

    setSaving(true);
    try {
      const { data, error: apiError } = await apiClient.PUT("/api/v1/profile", {
        body: {
          age: parseOptionalInt(form.age),
          sex: form.sex || null,
          height_cm: parseOptionalFloat(form.height_cm),
          base_weight_kg: parseOptionalFloat(form.base_weight_kg),
          experience_level: form.experience_level || null,
          primary_goal: form.primary_goal || null,
          training_days_per_week: parseOptionalInt(form.training_days_per_week),
          session_duration_min: parseOptionalInt(form.session_duration_min),
          equipment: parseTagInput(form.equipment),
          allergies: parseTagInput(form.allergies),
          food_preferences: parseTagInput(form.food_preferences),
          training_approach: form.training_approach,
          notes: form.notes.trim() || null,
        },
      });
      if (apiError || !data) {
        setError("No se pudo guardar tu Perfil Vivo. Revisa los campos e inténtalo de nuevo.");
        return;
      }
      setProfile(data);
      setForm(toFormState(data));
      setSuccessMessage("Perfil Vivo guardado correctamente.");
    } finally {
      setSaving(false);
    }
  }

  function handleInjuriesChanged(nextInjuries: InjuryResponse[]) {
    setProfile((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        injuries: nextInjuries,
        active_injuries_count: nextInjuries.filter((item) => item.status === "active").length,
      };
    });
  }

  const errorBannerId = error ? "profile-form-error" : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfil Vivo"
        description="Contexto persistente, visible y editable del Atleta que el Coach consulta en cada decisión."
      />

      {loading ? (
        <p role="status" className="text-sm text-ink-muted">
          Cargando tu contexto personal…
        </p>
      ) : !profile || !form ? (
        <AlertBanner tone="error">{error ?? "No se pudo cargar tu Perfil Vivo."}</AlertBanner>
      ) : (
        <>
          <ActiveCoachContextBanner profile={profile} />

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <Surface variant="default" padded="md" className="lg:col-span-7">
          <form onSubmit={handleSubmit} noValidate className="space-y-6">
            <div className="space-y-1">
              <h2 className="heading-section text-xl text-ink">Datos estructurados del Atleta</h2>
              <p className="text-xs text-ink-muted">
                Solo necesitas biometría y objetivo para empezar; el resto afina las propuestas del
                Coach.
              </p>
            </div>

            {error && (
              <div id="profile-form-error" ref={errorBannerRef}>
                <AlertBanner tone="error">{error}</AlertBanner>
              </div>
            )}
            {successMessage && <AlertBanner tone="success">{successMessage}</AlertBanner>}

            <fieldset className="space-y-3">
              <legend className="text-xs font-semibold text-accent-text">Biometría base</legend>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Edad (años)</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-invalid={invalidField === "age"}
                    aria-describedby={invalidField === "age" ? errorBannerId : undefined}
                    value={form.age}
                    onChange={(e) => setForm({ ...form, age: e.target.value })}
                    placeholder="Ej. 30"
                    className="tabular-nums"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Sexo</span>
                  <Select
                    value={form.sex}
                    onChange={(e) => setForm({ ...form, sex: e.target.value as BiologicalSex | "" })}
                  >
                    <option value="">Sin especificar</option>
                    {(Object.keys(SEX_LABELS) as BiologicalSex[]).map((key) => (
                      <option key={key} value={key}>
                        {SEX_LABELS[key]}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Altura (cm)</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.5"
                    aria-invalid={invalidField === "height_cm"}
                    aria-describedby={invalidField === "height_cm" ? errorBannerId : undefined}
                    value={form.height_cm}
                    onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                    placeholder="Ej. 178"
                    className="tabular-nums"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Peso base (kg)</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    aria-invalid={invalidField === "base_weight_kg"}
                    aria-describedby={invalidField === "base_weight_kg" ? errorBannerId : undefined}
                    value={form.base_weight_kg}
                    onChange={(e) => setForm({ ...form, base_weight_kg: e.target.value })}
                    placeholder="Ej. 80.5"
                    className="tabular-nums"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-5">
              <legend className="text-xs font-semibold text-accent-text">
                Entrenamiento y disponibilidad
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Nivel de experiencia</span>
                  <Select
                    value={form.experience_level}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        experience_level: e.target.value as ExperienceLevel | "",
                      })
                    }
                  >
                    <option value="">Seleccionar nivel</option>
                    {(Object.keys(EXPERIENCE_LABELS) as ExperienceLevel[]).map((key) => (
                      <option key={key} value={key}>
                        {EXPERIENCE_LABELS[key]}
                      </option>
                    ))}
                  </Select>
                </label>

                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Objetivo principal</span>
                  <Select
                    value={form.primary_goal}
                    onChange={(e) =>
                      setForm({ ...form, primary_goal: e.target.value as PrimaryGoal | "" })
                    }
                  >
                    <option value="">Seleccionar objetivo</option>
                    {(Object.keys(GOAL_LABELS) as PrimaryGoal[]).map((key) => (
                      <option key={key} value={key}>
                        {GOAL_LABELS[key]}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Días por semana</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-invalid={invalidField === "training_days_per_week"}
                    aria-describedby={
                      invalidField === "training_days_per_week" ? errorBannerId : undefined
                    }
                    value={form.training_days_per_week}
                    onChange={(e) => setForm({ ...form, training_days_per_week: e.target.value })}
                    placeholder="1–7"
                    className="tabular-nums"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Duración por sesión (min)</span>
                  <Input
                    type="number"
                    inputMode="numeric"
                    aria-invalid={invalidField === "session_duration_min"}
                    aria-describedby={
                      invalidField === "session_duration_min" ? errorBannerId : undefined
                    }
                    value={form.session_duration_min}
                    onChange={(e) => setForm({ ...form, session_duration_min: e.target.value })}
                    placeholder="Ej. 60"
                    className="tabular-nums"
                  />
                </label>
              </div>

              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Equipamiento disponible (separado por comas)</span>
                <Input
                  type="text"
                  value={form.equipment}
                  onChange={(e) => setForm({ ...form, equipment: e.target.value })}
                  placeholder="Ej. Barra olímpica, Mancuernas, Poleas, Prensa"
                />
              </label>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-5">
              <legend className="text-xs font-semibold text-accent-text">
                Nutrición y preferencias
              </legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Alergias o intolerancias (separadas por comas)</span>
                  <Input
                    type="text"
                    value={form.allergies}
                    onChange={(e) => setForm({ ...form, allergies: e.target.value })}
                    placeholder="Ej. Lactosa, Frutos secos"
                  />
                </label>

                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>Preferencias alimentarias (separadas por comas)</span>
                  <Input
                    type="text"
                    value={form.food_preferences}
                    onChange={(e) => setForm({ ...form, food_preferences: e.target.value })}
                    placeholder="Ej. Alta proteína, 4 comidas al día"
                  />
                </label>
              </div>
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-5">
              <legend className="text-xs font-semibold text-accent-text">Enfoque y notas</legend>
              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Enfoque de entrenamiento (Natural / PEDs)</span>
                <Select
                  value={form.training_approach}
                  onChange={(e) =>
                    setForm({ ...form, training_approach: e.target.value as TrainingApproach })
                  }
                >
                  {(Object.keys(APPROACH_LABELS) as TrainingApproach[]).map((key) => (
                    <option key={key} value={key}>
                      {APPROACH_LABELS[key]}
                    </option>
                  ))}
                </Select>
                <span className="block text-xs font-normal text-ink-subtle">
                  El Coach asume entrenamiento natural por defecto y nunca prescribe farmacología ni
                  ciclos.
                </span>
              </label>

              <label className="block space-y-1 text-xs font-medium text-ink-muted">
                <span>Notas adicionales para el Coach</span>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Horarios preferidos, contexto laboral, preferencias de ejercicios…"
                />
              </label>
            </fieldset>

            <Button type="submit" size="lg" disabled={saving}>
              {saving ? "Guardando…" : "Guardar Perfil Vivo"}
            </Button>
          </form>
        </Surface>

        <div className="lg:col-span-5">
          <InjuriesSection injuries={profile.injuries} onInjuriesChanged={handleInjuriesChanged} />
        </div>
      </div>
        </>
      )}
    </div>
  );
}
