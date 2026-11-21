import { type FormEvent, useState } from "react";
import { apiClient } from "../../api/client";
import {
  type InjuryResponse,
  type InjurySeverity,
  SEVERITY_LABELS,
} from "./labels";

interface InjuriesSectionProps {
  injuries: InjuryResponse[];
  onInjuriesChanged: (nextInjuries: InjuryResponse[]) => void;
}

export function InjuriesSection({ injuries, onInjuriesChanged }: InjuriesSectionProps) {
  const [bodyPart, setBodyPart] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<InjurySeverity>("moderate");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBodyPart, setEditBodyPart] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSeverity, setEditSeverity] = useState<InjurySeverity>("moderate");
  const [resolutionNotesMap, setResolutionNotesMap] = useState<Record<string, string>>({});

  async function handleAddInjury(event: FormEvent) {
    event.preventDefault();
    setError(null);

    if (!bodyPart.trim()) {
      setError("Debes indicar la zona corporal afectada.");
      return;
    }
    if (!description.trim()) {
      setError("Debes describir la lesión o restricción.");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: apiError } = await apiClient.POST("/api/v1/profile/injuries", {
        body: {
          body_part: bodyPart.trim(),
          description: description.trim(),
          severity,
        },
      });
      if (apiError || !data) {
        setError("No se pudo registrar la lesión o restricción.");
        return;
      }
      onInjuriesChanged([data, ...injuries]);
      setBodyPart("");
      setDescription("");
      setSeverity("moderate");
    } finally {
      setSubmitting(false);
    }
  }

  function startEdit(injury: InjuryResponse) {
    setEditingId(injury.id);
    setEditBodyPart(injury.body_part);
    setEditDescription(injury.description);
    setEditSeverity(injury.severity);
    setError(null);
  }

  async function handleSaveEdit(injuryId: string) {
    setError(null);
    if (!editBodyPart.trim() || !editDescription.trim()) {
      setError("La zona corporal y la descripción no pueden estar vacías.");
      return;
    }
    const { data, error: apiError } = await apiClient.PATCH(
      "/api/v1/profile/injuries/{injury_id}",
      {
        params: { path: { injury_id: injuryId } },
        body: {
          body_part: editBodyPart.trim(),
          description: editDescription.trim(),
          severity: editSeverity,
        },
      },
    );
    if (apiError || !data) {
      setError("No se pudo actualizar la restricción.");
      return;
    }
    onInjuriesChanged(injuries.map((item) => (item.id === injuryId ? data : item)));
    setEditingId(null);
  }

  async function handleToggleStatus(injury: InjuryResponse) {
    setError(null);
    const nextStatus = injury.status === "active" ? "resolved" : "active";
    const notes = resolutionNotesMap[injury.id]?.trim();
    const { data, error: apiError } = await apiClient.PATCH(
      "/api/v1/profile/injuries/{injury_id}",
      {
        params: { path: { injury_id: injury.id } },
        body:
          nextStatus === "resolved"
            ? {
                status: "resolved",
                resolution_notes: notes ? notes : null,
              }
            : { status: "active" },
      },
    );
    if (apiError || !data) {
      setError("No se pudo cambiar el estado de la restricción.");
      return;
    }
    onInjuriesChanged(injuries.map((item) => (item.id === injury.id ? data : item)));
  }

  async function handleDelete(injuryId: string) {
    setError(null);
    const { error: apiError } = await apiClient.DELETE("/api/v1/profile/injuries/{injury_id}", {
      params: { path: { injury_id: injuryId } },
    });
    if (apiError) {
      setError("No se pudo eliminar la restricción.");
      return;
    }
    onInjuriesChanged(injuries.filter((item) => item.id !== injuryId));
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div>
        <h2 className="text-base font-semibold text-white">Lesiones y restricciones físicas</h2>
        <p className="text-xs text-slate-400">
          Marca una molestia como resuelta o elimínala en un toque para que el Coach deje de
          restringir esos ejercicios de inmediato.
        </p>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      <form onSubmit={handleAddInjury} className="space-y-3 rounded-xl bg-slate-950/60 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-slate-300">Zona corporal</span>
            <input
              type="text"
              value={bodyPart}
              onChange={(e) => setBodyPart(e.target.value)}
              placeholder="Ej. Hombro derecho, rodilla izquierda"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </label>
          <label className="block space-y-1 text-xs">
            <span className="font-medium text-slate-300">Gravedad</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as InjurySeverity)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            >
              <option value="mild">Leve</option>
              <option value="moderate">Moderada</option>
              <option value="severe">Severa</option>
            </select>
          </label>
        </div>

        <label className="block space-y-1 text-xs">
          <span className="font-medium text-slate-300">Descripción de la lesión o restricción</span>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Molestia en press plano con agarre ancho"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-60 sm:w-auto"
        >
          {submitting ? "Añadiendo…" : "Añadir restricción"}
        </button>
      </form>

      {injuries.length === 0 ? (
        <p className="text-xs text-slate-400">
          No hay lesiones ni restricciones registradas en tu Perfil Vivo.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {injuries.map((injury) => {
            const isEditing = editingId === injury.id;
            const isActive = injury.status === "active";

            return (
              <li
                key={injury.id}
                className={`rounded-xl border p-3 ${
                  isActive
                    ? "border-amber-500/30 bg-slate-950/80"
                    : "border-slate-800 bg-slate-950/40 opacity-80"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <input
                        aria-label="Editar zona corporal"
                        type="text"
                        value={editBodyPart}
                        onChange={(e) => setEditBodyPart(e.target.value)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-white"
                      />
                      <select
                        aria-label="Editar gravedad"
                        value={editSeverity}
                        onChange={(e) => setEditSeverity(e.target.value as InjurySeverity)}
                        className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-white"
                      >
                        <option value="mild">Leve</option>
                        <option value="moderate">Moderada</option>
                        <option value="severe">Severa</option>
                      </select>
                    </div>
                    <input
                      aria-label="Editar descripción"
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-sm text-white"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(injury.id)}
                        className="rounded-lg bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950"
                      >
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-white">
                            {injury.body_part}
                          </span>
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                            {SEVERITY_LABELS[injury.severity]}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                              isActive
                                ? "bg-amber-500/20 text-amber-200"
                                : "bg-emerald-500/20 text-emerald-200"
                            }`}
                          >
                            {isActive ? "Activa" : "Resuelta"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-300">{injury.description}</p>
                        {injury.resolution_notes && (
                          <p className="mt-1 text-xs text-emerald-300">
                            Nota de recuperación: {injury.resolution_notes}
                          </p>
                        )}
                      </div>
                    </div>

                    {isActive && (
                      <input
                        type="text"
                        value={resolutionNotesMap[injury.id] ?? ""}
                        onChange={(e) =>
                          setResolutionNotesMap((prev) => ({
                            ...prev,
                            [injury.id]: e.target.value,
                          }))
                        }
                        placeholder="Nota opcional al marcar resuelta…"
                        aria-label={`Nota de resolución para ${injury.body_part}`}
                        className="w-full rounded-lg border border-slate-800 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-500"
                      />
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(injury)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                          isActive
                            ? "bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/30"
                            : "bg-amber-500/20 text-amber-200 hover:bg-amber-500/30"
                        }`}
                      >
                        {isActive ? "Marcar resuelta" : "Reactivar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(injury)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:border-slate-500"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(injury.id)}
                        className="rounded-lg border border-rose-500/40 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-950/60"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
