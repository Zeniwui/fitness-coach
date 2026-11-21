import { FormEvent, useState } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";

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
    <form
      onSubmit={(e) => void handleConfirmSave(e)}
      className="space-y-3 rounded-2xl border border-amber-500/50 bg-amber-950/20 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            Borrador de Sesión de Entrenamiento (sin guardar)
          </p>
          <p className="text-[11px] text-slate-300">
            Revisa y edita los campos antes de confirmar su guardado en tu historial.
          </p>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          className="rounded-lg border border-slate-600 px-2.5 py-1 text-xs text-slate-300 hover:border-slate-400"
        >
          Descartar borrador
        </button>
      </div>

      {ambiguities.length > 0 && (
        <div
          role="status"
          className="space-y-1 rounded-xl border border-amber-500/40 bg-amber-950/50 p-3 text-xs text-amber-200"
        >
          <p className="font-semibold text-amber-300">Campos pendientes o ambiguos detectados:</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {ambiguities.map((amb, i) => (
              <li key={`${amb.field}-${amb.set_index ?? i}`}>{amb.message_es}</li>
            ))}
          </ul>
        </div>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
        >
          {errorMsg}
        </p>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="block text-xs text-slate-300">
          Nombre del borrador
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
          />
        </label>
        <label className="block text-xs text-slate-300">
          Fecha de sesión
          <input
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
          />
        </label>
      </div>

      <div className="space-y-2">
        {sets.map((row, idx) => {
          const loadMissing = row.missing_fields.includes("load") && row.load.trim() === "";
          const rirMissing =
            row.missing_fields.includes("rir") && row.rir.trim() === "" && row.rpe.trim() === "";
          return (
            <div
              key={idx}
              className="grid grid-cols-2 gap-2 rounded-xl border border-slate-800 bg-slate-950/70 p-2.5 sm:grid-cols-6"
            >
              <label className="col-span-2 block text-[11px] text-slate-400">
                Ejercicio serie {idx + 1}
                <input
                  type="text"
                  value={row.exercise_name}
                  onChange={(e) => updateSet(idx, { exercise_name: e.target.value })}
                  className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Reps serie {idx + 1}
                <input
                  type="number"
                  min={1}
                  value={row.reps}
                  onChange={(e) => updateSet(idx, { reps: e.target.value })}
                  className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                />
              </label>
              <label
                className={`block text-[11px] ${
                  loadMissing ? "font-semibold text-amber-300" : "text-slate-400"
                }`}
              >
                Carga serie {idx + 1} ({row.unit})
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  placeholder="Pendiente"
                  value={row.load}
                  onChange={(e) => updateSet(idx, { load: e.target.value })}
                  className={`mt-0.5 w-full rounded-lg border px-2 py-1 text-xs text-white ${
                    loadMissing
                      ? "border-amber-400 bg-amber-950/40"
                      : "border-slate-700 bg-slate-900"
                  }`}
                />
              </label>
              <label
                className={`block text-[11px] ${
                  rirMissing ? "font-semibold text-amber-300" : "text-slate-400"
                }`}
              >
                RIR serie {idx + 1}
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  max={10}
                  placeholder="Opcional"
                  value={row.rir}
                  onChange={(e) => updateSet(idx, { rir: e.target.value })}
                  className={`mt-0.5 w-full rounded-lg border px-2 py-1 text-xs text-white ${
                    rirMissing
                      ? "border-amber-400 bg-amber-950/40"
                      : "border-slate-700 bg-slate-900"
                  }`}
                />
              </label>
              <label className="block text-[11px] text-slate-400">
                Músculo
                <input
                  type="text"
                  value={row.muscle_group}
                  onChange={(e) => updateSet(idx, { muscle_group: e.target.value })}
                  className="mt-0.5 w-full rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                />
              </label>
            </div>
          );
        })}
      </div>

      <label className="block text-xs text-slate-300">
        Notas de fatiga / sensaciones
        <input
          type="text"
          value={fatigueNotes}
          onChange={(e) => setFatigueNotes(e.target.value)}
          placeholder="Ej. última serie costó mucho"
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
        />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Confirmar y guardar sesión"}
        </button>
      </div>
    </form>
  );
}
