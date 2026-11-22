import { FormEvent, useState } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";

export type TrainingSessionDraftItem = components["schemas"]["TrainingSessionDraftResponse"];
type SessionSetInput = components["schemas"]["SessionSetInput"];

interface EditableDraftSet {
  exercise_name: string;
  muscle_group: string;
  reps: string;
  load: string;
  unit: "kg" | "lb";
  rir: string;
  rpe: string;
  notes: string;
  missing_fields: string[];
}

interface SessionDraftCardProps {
  draft: TrainingSessionDraftItem;
  activeMesocycleId?: string | null;
  onSaved?: () => void | Promise<void>;
  onDiscard: () => void;
}

export function SessionDraftCard({
  draft,
  activeMesocycleId = null,
  onSaved,
  onDiscard,
}: SessionDraftCardProps) {
  const [name, setName] = useState(draft.name);
  const [sessionDate, setSessionDate] = useState(draft.session_date);
  const [fatigueNotes, setFatigueNotes] = useState(draft.fatigue_notes ?? "");
  const [sets, setSets] = useState<EditableDraftSet[]>(() =>
    (draft.sets ?? []).map((s) => ({
      exercise_name: s.exercise_name,
      muscle_group: s.muscle_group,
      reps: s.reps !== null && s.reps !== undefined ? String(s.reps) : "",
      load: s.load !== null && s.load !== undefined ? String(s.load) : "",
      unit: s.unit === "lb" ? "lb" : "kg",
      rir: s.rir !== null && s.rir !== undefined ? String(s.rir) : "",
      rpe: s.rpe !== null && s.rpe !== undefined ? String(s.rpe) : "",
      notes: s.notes ?? "",
      missing_fields: s.missing_fields ?? [],
    })),
  );
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  function updateSet(idx: number, patch: Partial<EditableDraftSet>) {
    setSets((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, ...patch };
        const stillMissing = next.missing_fields.filter((f) => {
          if (f === "load" && next.load.trim() !== "") return false;
          if (f === "reps" && next.reps.trim() !== "") return false;
          if (f === "rir" && (next.rir.trim() !== "" || next.rpe.trim() !== "")) return false;
          return true;
        });
        return { ...next, missing_fields: stillMissing };
      }),
    );
  }

  async function handleConfirmSave(e: FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    const missingRequired = sets.find(
      (s) => !s.exercise_name.trim() || s.reps.trim() === "" || s.load.trim() === "",
    );
    if (missingRequired) {
      setErrorMsg(
        "Completa el nombre del ejercicio, repeticiones y carga en todas las series antes de confirmar.",
      );
      return;
    }

    const payloadSets: SessionSetInput[] = sets.map((s, idx) => ({
      exercise_name: s.exercise_name.trim(),
      muscle_group: s.muscle_group.trim() || "pecho",
      secondary_muscle_groups: [],
      set_order: idx + 1,
      reps: Math.max(1, Number(s.reps)),
      load: Math.max(0, Number(s.load)),
      unit: s.unit,
      rir: s.rir.trim() !== "" ? Number(s.rir) : null,
      rpe: s.rpe.trim() !== "" ? Number(s.rpe) : null,
      notes: s.notes.trim() || null,
    }));

    setSaving(true);
    try {
      const res = await apiClient.POST("/api/v1/training/sessions", {
        body: {
          session_date: sessionDate,
          name: name.trim() || "Sesión de Entrenamiento",
          mesocycle_id: activeMesocycleId,
          planned_session_id: null,
          origin: draft.origin ?? "chat_text",
          fatigue_notes: fatigueNotes.trim() || null,
          sets: payloadSets,
        },
      });
      if (res.error) {
        setErrorMsg("No se pudo guardar la Sesión de Entrenamiento. Revisa los datos.");
        return;
      }
      await onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  const ambiguities = draft.ambiguities ?? [];

  return (
    <Surface variant="warning" padded="md">
      <form onSubmit={(e) => void handleConfirmSave(e)} className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-warning-text">
              Borrador de Sesión de Entrenamiento (sin guardar)
            </p>
            <p className="text-xs text-ink-muted">
              Revisa y edita los campos antes de confirmar su guardado en tu historial.
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={onDiscard}>
            Descartar borrador
          </Button>
        </div>

        {ambiguities.length > 0 && (
          <AlertBanner tone="warning" className="text-xs">
            <p className="font-semibold">Campos pendientes o ambiguos detectados:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {ambiguities.map((amb, i) => (
                <li key={`${amb.field}-${amb.set_index ?? i}`}>{amb.message_es}</li>
              ))}
            </ul>
          </AlertBanner>
        )}

        {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Nombre del borrador</span>
            <Input
              compact
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Fecha de sesión</span>
            <Input
              compact
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </label>
        </div>

        <div className="space-y-2.5">
          {sets.map((row, idx) => {
            const loadMissing = row.missing_fields.includes("load") && row.load.trim() === "";
            const rirMissing =
              row.missing_fields.includes("rir") && row.rir.trim() === "" && row.rpe.trim() === "";
            return (
              <div
                key={idx}
                className="grid grid-cols-2 gap-2.5 rounded-panel border border-line bg-surface p-3 sm:grid-cols-6"
              >
                <label className="col-span-2 block space-y-1 text-xs text-ink-muted">
                  <span>Ejercicio serie {idx + 1}</span>
                  <Input
                    compact
                    type="text"
                    value={row.exercise_name}
                    onChange={(e) => updateSet(idx, { exercise_name: e.target.value })}
                  />
                </label>
                <label className="block space-y-1 text-xs text-ink-muted">
                  <span>Reps serie {idx + 1}</span>
                  <Input
                    compact
                    type="number"
                    min={1}
                    value={row.reps}
                    onChange={(e) => updateSet(idx, { reps: e.target.value })}
                    className="tabular-nums"
                  />
                </label>
                <label
                  className={`block space-y-1 text-xs ${
                    loadMissing ? "font-semibold text-warning-text" : "text-ink-muted"
                  }`}
                >
                  <span>
                    Carga serie {idx + 1} ({row.unit})
                  </span>
                  <Input
                    compact
                    type="number"
                    step="0.5"
                    min={0}
                    placeholder="Pendiente"
                    value={row.load}
                    onChange={(e) => updateSet(idx, { load: e.target.value })}
                    className={`tabular-nums ${loadMissing ? "border-warning bg-warning-soft/50" : ""}`}
                  />
                </label>
                <label
                  className={`block space-y-1 text-xs ${
                    rirMissing ? "font-semibold text-warning-text" : "text-ink-muted"
                  }`}
                >
                  <span>RIR serie {idx + 1}</span>
                  <Input
                    compact
                    type="number"
                    step="0.5"
                    min={0}
                    max={10}
                    placeholder="Opcional"
                    value={row.rir}
                    onChange={(e) => updateSet(idx, { rir: e.target.value })}
                    className={`tabular-nums ${rirMissing ? "border-warning bg-warning-soft/50" : ""}`}
                  />
                </label>
                <label className="block space-y-1 text-xs text-ink-muted">
                  <span>Músculo</span>
                  <Input
                    compact
                    type="text"
                    value={row.muscle_group}
                    onChange={(e) => updateSet(idx, { muscle_group: e.target.value })}
                  />
                </label>
              </div>
            );
          })}
        </div>

        <label className="block space-y-1 text-xs font-medium text-ink-muted">
          <span>Notas de fatiga / sensaciones</span>
          <Input
            compact
            type="text"
            value={fatigueNotes}
            onChange={(e) => setFatigueNotes(e.target.value)}
            placeholder="Ej. última serie costó mucho"
          />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" disabled={saving}>
            {saving ? "Guardando…" : "Confirmar y guardar sesión"}
          </Button>
        </div>
      </form>
    </Surface>
  );
}
