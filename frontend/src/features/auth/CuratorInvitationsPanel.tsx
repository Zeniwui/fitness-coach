import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiClient, DuplicateSubmissionError } from "../../api/client";
import type { components } from "../../api/generated/schema";

type InvitationSummary = components["schemas"]["InvitationSummaryResponse"];

export function CuratorInvitationsPanel() {
  const [invitations, setInvitations] = useState<InvitationSummary[]>([]);
  const [email, setEmail] = useState("");
  const [grantCurator, setGrantCurator] = useState(false);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const { data, error: apiError } = await apiClient.POST(
        "/api/v1/curator/invitations",
        {
          body: { email: email.trim(), roles },
        },
      );
      if (data) {
        setGeneratedToken(data.invitation_token);
        setEmail("");
        setGrantCurator(false);
        setInvitations((prev) => [data, ...prev]);
      } else {
        const detail =
          typeof apiError === "object" && apiError && "detail" in apiError
            ? String((apiError as { detail: unknown }).detail)
            : "No se pudo generar la invitación.";
        setError(detail);
      }
    } catch (err) {
      if (!(err instanceof DuplicateSubmissionError)) {
        setError("Error al crear la invitación.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="rounded-xl border border-emerald-500/30 bg-slate-900/80 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-emerald-300">
          Panel del Curador — Invitaciones
        </h2>
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
          Curador
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        Emite invitaciones de un solo uso para incorporar nuevos Atletas sin abrir registro público.
      </p>

      <form onSubmit={handleCreateInvitation} className="mt-4 space-y-3">
        <div>
          <label
            htmlFor="invite-email"
            className="block text-xs font-medium text-slate-300"
          >
            Correo del Atleta
          </label>
          <input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="atleta@ejemplo.com"
            className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={grantCurator}
            onChange={(e) => setGrantCurator(e.target.checked)}
            className="rounded border-slate-700 bg-slate-950"
          />
          Incluir rol dual de Curador además de Atleta
        </label>

        {error && (
          <p role="alert" className="text-xs text-rose-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
        >
          {submitting ? "Generando…" : "Generar invitación"}
        </button>
      </form>

      {generatedToken && (
        <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-950/40 p-3">
          <p className="text-xs font-medium text-emerald-200">
            Código generado (compártelo de forma privada):
          </p>
          <code className="mt-1 block break-all text-xs font-mono text-white">
            {generatedToken}
          </code>
        </div>
      )}

      {invitations.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-800 text-xs">
          {invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between py-2">
              <span className="text-slate-200">{inv.email}</span>
              <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                {inv.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
