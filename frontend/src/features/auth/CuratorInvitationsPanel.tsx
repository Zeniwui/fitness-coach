import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Check, Copy } from "lucide-react";
import {
  apiClient,
  DuplicateSubmissionError,
  extractApiErrorDetail,
} from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { INVITATION_STATUS_LABELS } from "../science/labels";

type InvitationSummary = components["schemas"]["InvitationSummaryResponse"];

export function CuratorInvitationsPanel() {
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [email, setEmail] = useState("");
  const [grantCurator, setGrantCurator] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const directInviteLink = generatedToken
    ? `${window.location.origin}/?invite=${encodeURIComponent(generatedToken)}`
    : null;

  const loadInvitations = useCallback(async () => {
    setLoadingList(true);
    try {
      const { data, error: apiError } = await apiClient.GET("/api/v1/curator/invitations");
      if (data) {
        setInvitations(data.items);
      } else if (apiError) {
        setError(extractApiErrorDetail(apiError, "No se pudo cargar el listado de invitaciones."));
      }
    } catch {
      setError("Error de conexión al cargar las invitaciones.");
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  async function handleCreateInvitation(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const roles: ("athlete" | "curator")[] = grantCurator
        ? ["athlete", "curator"]
        : ["athlete"];
      const { data, error: apiError } = await apiClient.POST("/api/v1/curator/invitations", {
        body: { email: email.trim(), roles },
      });
      if (data) {
        setGeneratedToken(data.invitation_token);
        setCopied(false);
        setEmail("");
        setGrantCurator(false);
        const normalizedEmail = data.email.trim().toLowerCase();
        setInvitations((prev) => [
          data,
          ...prev.filter(
            (inv) =>
              !(
                inv.status === "pending" &&
                inv.email.trim().toLowerCase() === normalizedEmail
              ),
          ),
        ]);
      } else {
        setError(extractApiErrorDetail(apiError, "No se pudo generar la invitación."));
      }
    } catch (err) {
      if (!(err instanceof DuplicateSubmissionError)) {
        setError("Error al crear la invitación.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    setRevokingId(invitationId);
    setError(null);
    try {
      const { response, error: apiError } = await apiClient.DELETE(
        "/api/v1/curator/invitations/{invitation_id}",
        { params: { path: { invitation_id: invitationId } } },
      );
      if (response.ok) {
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      } else {
        setError(extractApiErrorDetail(apiError, "No se pudo revocar la invitación."));
      }
    } catch (err) {
      if (!(err instanceof DuplicateSubmissionError)) {
        setError("Error de conexión al revocar la invitación.");
      }
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopyLink() {
    if (!directInviteLink) return;
    if (!navigator.clipboard?.writeText) {
      setCopied(false);
      setError(
        "El portapapeles no está disponible en este navegador. Copia el enlace manualmente.",
      );
      return;
    }
    setError(null);
    try {
      await navigator.clipboard.writeText(directInviteLink);
      setCopied(true);
    } catch {
      setCopied(false);
      setError("No se pudo copiar el enlace al portapapeles.");
    }
  }

  return (
    <Surface variant="focal" padded="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="heading-section text-lg text-ink">Panel del Curador — Invitaciones</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Emite invitaciones de un solo uso para incorporar nuevos Atletas sin abrir registro
            público.
          </p>
        </div>
        <Badge tone="secondary">Acceso privado</Badge>
      </div>

      <form onSubmit={handleCreateInvitation} className="space-y-3">
        <div>
          <label htmlFor="invite-email" className="block text-xs font-medium text-ink-muted">
            Correo del Atleta
          </label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="atleta@ejemplo.com"
            className="mt-1.5"
          />
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-xs text-ink-muted sm:min-h-[32px]">
          <input
            type="checkbox"
            checked={grantCurator}
            onChange={(e) => setGrantCurator(e.target.checked)}
            className="h-4 w-4 rounded border-line-strong accent-accent"
          />
          <span>Incluir rol dual de Curador además de Atleta</span>
        </label>

        {error && <AlertBanner tone="error">{error}</AlertBanner>}

        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Generando…" : "Generar invitación"}
        </Button>
      </form>

      {generatedToken && directInviteLink && (
        <Surface variant="accent" padded="sm" className="space-y-2.5 text-xs">
          <div>
            <p className="font-semibold text-accent-text">
              Código generado (compártelo de forma privada):
            </p>
            <code className="mt-1 block break-all font-mono text-ink">{generatedToken}</code>
          </div>
          <div>
            <p className="font-semibold text-accent-text">Enlace directo de invitación:</p>
            <code className="mt-1 block break-all font-mono text-ink-muted">
              {directInviteLink}
            </code>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <Button variant="secondary" size="sm" onClick={() => void handleCopyLink()}>
              {copied ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              <span>Copiar enlace</span>
            </Button>
            {copied && (
              <span role="status" className="text-xs font-semibold text-success-text">
                Enlace copiado
              </span>
            )}
          </div>
        </Surface>
      )}

      {loadingList ? (
        <p className="text-xs text-ink-muted">Cargando invitaciones emitidas…</p>
      ) : invitations.length > 0 ? (
        <ul className="divide-y divide-line border-t border-line pt-2 text-xs">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="min-w-0 break-all font-medium text-ink">{inv.email}</span>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={inv.status === "pending" ? "accent" : "neutral"} className="shrink-0">
                  {INVITATION_STATUS_LABELS[inv.status] ?? inv.status}
                </Badge>
                {inv.status === "pending" && (
                  <ConfirmActionButton
                    label="Revocar"
                    ariaLabel={`Revocar invitación de ${inv.email}`}
                    disabled={revokingId === inv.id}
                    onConfirm={() => handleRevokeInvitation(inv.id)}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="border-t border-line pt-3 text-xs text-ink-muted">
          Aún no has emitido invitaciones.
        </p>
      )}
    </Surface>
  );
}
