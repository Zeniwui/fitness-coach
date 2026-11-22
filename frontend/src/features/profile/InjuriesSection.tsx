import { type FormEvent, useState } from "react";
import { apiClient } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input, Select } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
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
    <Surface variant="default" padded="md" className="space-y-4">
      <div className="space-y-1">
        <h2 className="heading-section text-xl text-ink">Lesiones y restricciones físicas</h2>
        <p className="text-xs leading-relaxed text-ink-muted">
          Marca una molestia como resuelta o elimínala en un toque para que el Coach deje de
          restringir esos ejercicios de inmediato.
        </p>
      </div>

      {error && <AlertBanner tone="error">{error}</AlertBanner>}

      <form
        onSubmit={handleAddInjury}
        className="space-y-3 rounded-panel border border-line bg-surface-muted/50 p-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Zona corporal</span>
            <Input
              type="text"
              value={bodyPart}
              onChange={(e) => setBodyPart(e.target.value)}
              placeholder="Ej. Hombro derecho, rodilla izquierda"
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Gravedad</span>
            <Select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as InjurySeverity)}
            >
              {(Object.keys(SEVERITY_LABELS) as InjurySeverity[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {SEVERITY_LABELS[lvl]}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <label className="block space-y-1 text-xs font-medium text-ink-muted">
          <span>Descripción de la lesión o restricción</span>
          <Input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ej. Molestia en press plano con agarre ancho"
          />
        </label>

        <Button type="submit" variant="warning" disabled={submitting}>
          {submitting ? "Añadiendo…" : "Añadir restricción"}
        </Button>
      </form>

      {injuries.length === 0 ? (
        <p className="text-xs text-ink-muted">
          No hay lesiones ni restricciones registradas en tu Perfil Vivo.
        </p>
      ) : (
        <ul className="space-y-3">
          {injuries.map((injury) => {
            const isEditing = editingId === injury.id;
            const isActive = injury.status === "active";

            return (
              <li
                key={injury.id}
                className={`rounded-panel border p-4 ${
                  isActive
                    ? "border-warning/35 bg-warning-soft/35"
                    : "border-line bg-surface-muted/40 opacity-85"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <Input
                        compact
                        aria-label="Editar zona corporal"
                        type="text"
                        value={editBodyPart}
                        onChange={(e) => setEditBodyPart(e.target.value)}
                      />
                      <Select
                        compact
                        aria-label="Editar gravedad"
                        value={editSeverity}
                        onChange={(e) => setEditSeverity(e.target.value as InjurySeverity)}
                      >
                        {(Object.keys(SEVERITY_LABELS) as InjurySeverity[]).map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {SEVERITY_LABELS[lvl]}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Input
                      compact
                      aria-label="Editar descripción"
                      type="text"
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void handleSaveEdit(injury.id)}>
                        Guardar cambios
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{injury.body_part}</span>
                        <Badge tone="neutral">{SEVERITY_LABELS[injury.severity]}</Badge>
                        <Badge tone={isActive ? "warning" : "success"}>
                          {isActive ? "Activa" : "Resuelta"}
                        </Badge>
                      </div>
                      <p className="text-xs leading-relaxed text-ink-muted">
                        {injury.description}
                      </p>
                      {injury.resolution_notes && (
                        <p className="text-xs font-medium text-success-text">
                          Nota de recuperación: {injury.resolution_notes}
                        </p>
                      )}
                    </div>

                    {isActive && (
                      <Input
                        compact
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
                      />
                    )}

                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant={isActive ? "soft" : "secondary"}
                        size="sm"
                        onClick={() => void handleToggleStatus(injury)}
                      >
                        {isActive ? "Marcar resuelta" : "Reactivar"}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => startEdit(injury)}>
                        Editar
                      </Button>
                      <ConfirmActionButton
                        label="Eliminar"
                        confirmLabel="Confirmar eliminación"
                        variant="danger"
                        size="sm"
                        onConfirm={() => void handleDelete(injury.id)}
                      />
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Surface>
  );
}
