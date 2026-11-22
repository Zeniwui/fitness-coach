import { useEffect, useState, type FormEvent } from "react";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { useAuth } from "./AuthContext";

export function ActivationPanel() {
  const {
    pendingEmail,
    pendingInviteCode,
    redeemInvitation,
    bootstrapCurator,
    logout,
    error,
  } = useAuth();
  const [mode, setMode] = useState<"invite" | "bootstrap">("invite");
  const [invitationToken, setInvitationToken] = useState(pendingInviteCode ?? "");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (pendingInviteCode) {
      setInvitationToken(pendingInviteCode);
    }
  }, [pendingInviteCode]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === "invite") {
        await redeemInvitation({ invitationToken, displayName });
      } else {
        await bootstrapCurator({ displayName });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-5 space-y-4">
      <Surface variant="accent" padded="sm" className="text-xs">
        <p className="font-semibold text-accent-text">Sesión iniciada como:</p>
        <p className="mt-0.5 font-mono text-ink">{pendingEmail ?? "Identidad verificada"}</p>
        <p className="mt-1 text-ink-muted">
          Tu cuenta aún no está activada en Fitness Coach. Canjea tu invitación o activa el primer
          Curador si es un despliegue nuevo.
        </p>
      </Surface>

      <div className="grid grid-cols-2 gap-1.5 rounded-control border border-line bg-surface-muted p-1">
        <button
          type="button"
          onClick={() => setMode("invite")}
          className={`rounded-[calc(var(--radius-control)-2px)] py-2 text-xs font-semibold transition-colors ${
            mode === "invite"
              ? "bg-surface text-ink shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Canjear invitación
        </button>
        <button
          type="button"
          onClick={() => setMode("bootstrap")}
          className={`rounded-[calc(var(--radius-control)-2px)] py-2 text-xs font-semibold transition-colors ${
            mode === "bootstrap"
              ? "bg-surface text-ink shadow-sm"
              : "text-ink-muted hover:text-ink"
          }`}
        >
          Activar Curador inicial
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === "invite" && (
          <div>
            <label
              htmlFor="invitation-token"
              className="block text-xs font-medium text-ink-muted"
            >
              Código de invitación
            </label>
            <Input
              id="invitation-token"
              type="text"
              required
              value={invitationToken}
              onChange={(e) => setInvitationToken(e.target.value)}
              placeholder="Código facilitado por el Curador"
              className="mt-1.5"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="activation-display-name"
            className="block text-xs font-medium text-ink-muted"
          >
            Nombre de Atleta (opcional)
          </label>
          <Input
            id="activation-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ej. Alex"
            className="mt-1.5"
          />
        </div>

        {error && <AlertBanner tone="error">{error}</AlertBanner>}

        <Button type="submit" size="lg" fullWidth disabled={submitting}>
          {submitting
            ? "Activando cuenta…"
            : mode === "invite"
              ? "Activar cuenta con invitación"
              : "Activar cuenta de Curador"}
        </Button>
      </form>

      <Button variant="secondary" size="sm" fullWidth onClick={() => void logout()}>
        Cerrar sesión
      </Button>
    </div>
  );
}
