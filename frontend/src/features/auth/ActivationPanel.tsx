import { useEffect, useState, type FormEvent } from "react";
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
    if (pendingInviteCode && !invitationToken) {
      setInvitationToken(pendingInviteCode);
    }
  }, [pendingInviteCode, invitationToken]);

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
      <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/30 p-3 text-xs text-emerald-200">
        <p className="font-medium text-emerald-100">Sesión iniciada como:</p>
        <p className="mt-0.5 font-mono text-white">{pendingEmail ?? "Identidad verificada"}</p>
        <p className="mt-1 text-slate-300">
          Tu cuenta aún no está activada en Fitness Coach. Canjea tu invitación o activa el primer Curador si es un despliegue nuevo.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-1">
        <button
          type="button"
          onClick={() => setMode("invite")}
          className={`rounded-md py-2 text-xs font-semibold transition ${
            mode === "invite"
              ? "bg-emerald-600 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Canjear invitación
        </button>
        <button
          type="button"
          onClick={() => setMode("bootstrap")}
          className={`rounded-md py-2 text-xs font-semibold transition ${
            mode === "bootstrap"
              ? "bg-emerald-600 text-white"
              : "text-slate-400 hover:text-white"
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
              className="block text-xs font-medium text-slate-300"
            >
              Código de invitación
            </label>
            <input
              id="invitation-token"
              type="text"
              required
              value={invitationToken}
              onChange={(e) => setInvitationToken(e.target.value)}
              placeholder="Código facilitado por el Curador"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>
        )}

        <div>
          <label
            htmlFor="activation-display-name"
            className="block text-xs font-medium text-slate-300"
          >
            Nombre de Atleta (opcional)
          </label>
          <input
            id="activation-display-name"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ej. Alex"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-rose-950/80 p-3 text-xs text-rose-200">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting
            ? "Activando cuenta…"
            : mode === "invite"
              ? "Activar cuenta con invitación"
              : "Activar cuenta de Curador"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void logout()}
        className="w-full rounded-lg border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white"
      >
        Cerrar sesión
      </button>
    </div>
  );
}
