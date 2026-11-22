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
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";

type InvitationSummary = components["schemas"]["InvitationSummaryResponse"];

export function CuratorInvitationsPanel() {
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [email, setEmail] = useState("");
  const [grantCurator, setGrantCurator] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const directInviteLink = generatedToken
    ? `${window.location.origin}/?invite=${encodeURIComponent(generatedToken)}`
    : null;

  const loadInvitations = useCallback(async () => {
    const { data } = await apiClient.GET("/api/v1/curator/invitations");
    if (data) {
      setInvitations(data.items);
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
        setInvitations((prev) => [data, ...prev]);
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
    <Surface variant="default" padded="md" className="space-y-4">
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

        <label className="flex items-center gap-2 text-xs text-ink-muted">
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

      {invitations.length > 0 && (
        <ul className="divide-y divide-line border-t border-line pt-2 text-xs">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-2 py-2.5">
              <span className="font-medium text-ink">{inv.email}</span>
              <Badge tone="neutral">{inv.status}</Badge>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  );
}
