import { useState, type FormEvent } from "react";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { loginWithToken, redeemInvitation, error } = useAuth();
  const [mode, setMode] = useState<"login" | "invite">("login");
  const [sessionToken, setSessionToken] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      if (mode === "login") {
        await loginWithToken(sessionToken);
      } else {
        await redeemInvitation({
          sessionToken,
          invitationToken,
          displayName,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-8">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
          Fitness Coach
        </p>
        <h1 className="mt-1 text-2xl font-bold text-white">
          Acceso privado por invitación
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          El registro público está deshabilitado. Inicia sesión con tu cuenta autorizada o canjea una invitación emitida por un Curador.
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md py-2 text-xs font-semibold transition ${
              mode === "login"
                ? "bg-emerald-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Iniciar sesión
          </button>
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
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label
              htmlFor="session-token"
              className="block text-xs font-medium text-slate-300"
            >
              Token de sesión
            </label>
            <input
              id="session-token"
              type="password"
              required
              value={sessionToken}
              onChange={(e) => setSessionToken(e.target.value)}
              placeholder="Pega tu token de sesión"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {mode === "invite" && (
            <>
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

              <div>
                <label
                  htmlFor="display-name"
                  className="block text-xs font-medium text-slate-300"
                >
                  Nombre de Atleta
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ej. Alex"
                  className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </>
          )}

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
              ? "Verificando…"
              : mode === "login"
                ? "Entrar"
                : "Activar cuenta con invitación"}
          </button>
        </form>
      </div>
    </main>
  );
}
