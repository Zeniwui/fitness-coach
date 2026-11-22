import type { FormEvent } from "react";
import { Button } from "../../ui/Button";
import { Input, Textarea } from "../../ui/Field";
import { MetricBar } from "../../ui/MetricBar";
import { Surface } from "../../ui/Surface";

export interface CheckInFormState {
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

interface WeeklyCheckInFormProps {
  form: CheckInFormState;
  submitting: boolean;
  onChange: (patch: Partial<CheckInFormState>) => void;
  onSubmit: (e: FormEvent) => void;
}

const SCORE_FIELDS: ReadonlyArray<{
  key: keyof Pick<
    CheckInFormState,
    | "adherence_score"
    | "sleep_quality"
    | "energy_level"
    | "hunger_level"
    | "recovery_score"
    | "perceived_fatigue"
  >;
  label: string;
  tone: "accent" | "secondary" | "warning" | "success";
}> = [
  { key: "adherence_score", label: "Adherencia (1-10)", tone: "success" },
  { key: "sleep_quality", label: "Calidad de sueño (1-10)", tone: "secondary" },
  { key: "energy_level", label: "Energía (1-10)", tone: "accent" },
  { key: "hunger_level", label: "Hambre (1-10)", tone: "warning" },
  { key: "recovery_score", label: "Recuperación (1-10)", tone: "success" },
  { key: "perceived_fatigue", label: "Fatiga percibida (1-10)", tone: "warning" },
];

export function WeeklyCheckInForm({
  form,
  submitting,
  onChange,
  onSubmit,
}: WeeklyCheckInFormProps) {
  return (
    <Surface id="checkin-semanal" variant="default" padded="md">
      <form onSubmit={onSubmit} className="space-y-5">
        <div className="space-y-1">
          <h2 className="heading-section text-xl text-ink">Check-in semanal guiado</h2>
          <p className="text-xs leading-relaxed text-ink-muted">
            Registra tu peso corporal, sensaciones y rendimiento para que el Coach evalúe tu
            tendencia.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Peso medio semanal (kg)</span>
            <Input
              type="number"
              step="0.05"
              value={form.average_weight_kg}
              onChange={(e) => onChange({ average_weight_kg: e.target.value })}
              placeholder="Ej. 81.9"
              className="tabular-nums"
            />
          </label>

          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>O lecturas diarias separadas por coma (kg)</span>
            <Input
              type="text"
              value={form.daily_weights_raw}
              onChange={(e) => onChange({ daily_weights_raw: e.target.value })}
              placeholder="Ej. 82.1, 81.9, 81.8"
              className="tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Cintura (cm, opcional)</span>
            <Input
              type="number"
              step="0.1"
              value={form.waist_cm}
              onChange={(e) => onChange({ waist_cm: e.target.value })}
              placeholder="Ej. 84.5"
              className="tabular-nums"
            />
          </label>

          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Pecho (cm, opcional)</span>
            <Input
              type="number"
              step="0.1"
              value={form.chest_cm}
              onChange={(e) => onChange({ chest_cm: e.target.value })}
              placeholder="Ej. 104.0"
              className="tabular-nums"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {SCORE_FIELDS.map(({ key, label, tone }) => {
            const numericVal = Number(form[key]) || 0;
            return (
              <div
                key={key}
                className="space-y-2 rounded-control border border-line bg-surface-muted/50 p-2.5"
              >
                <label className="block space-y-1 text-xs font-medium text-ink-muted">
                  <span>{label}</span>
                  <Input
                    compact
                    type="number"
                    min={1}
                    max={10}
                    value={form[key]}
                    onChange={(e) => onChange({ [key]: e.target.value })}
                    className="tabular-nums"
                  />
                </label>
                <MetricBar value={numericVal} max={10} tone={tone} />
              </div>
            );
          })}
        </div>

        <label className="block space-y-1 text-xs font-medium text-ink-muted">
          <span>Notas de rendimiento y sensaciones</span>
          <Textarea
            rows={2}
            value={form.performance_notes}
            onChange={(e) => onChange({ performance_notes: e.target.value })}
            placeholder="Ej. Cargas estables en press banca, ligera fatiga lumbar el viernes"
          />
        </label>

        <Button type="submit" size="lg" fullWidth disabled={submitting}>
          {submitting ? "Analizando Check-in…" : "Enviar Check-in semanal"}
        </Button>
      </form>
    </Surface>
  );
}
