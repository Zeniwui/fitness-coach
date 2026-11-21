import { useState, type FormEvent } from "react";
import { ActivationPanel } from "./ActivationPanel";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { status, missingEnvVars, signInWithPassword, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting || status === "unconfigured") return;
    setSubmitting(true);
    try {
      await signInWithPassword(email, password);
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
          El registro público está deshabilitado. Inicia sesión con tu correo electrónico y contraseña autorizados.
        </p>

        {status === "unconfigured" ? (
          <div
            role="alert"
            className="mt-5 rounded-lg border border-amber-500/40 bg-amber-950/60 p-4 text-xs text-amber-200"
          >
            <p className="font-semibold text-amber-100">
              Falta configurar Supabase Auth en la PWA
            </p>
            <p className="mt-1">
              Define las variables públicas faltantes en el entorno del frontend antes de iniciar sesión:
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4 font-mono text-amber-100">
              {missingEnvVars.map((envVar) => (
                <li key={envVar}>{envVar}</li>
              ))}
            </ul>
          </div>
        ) : status === "needs_activation" ? (
          <ActivationPanel />
        ) : (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="auth-email"
                className="block text-xs font-medium text-slate-300"
              >
                Correo electrónico
              </label>
              <input
                id="auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="atleta@ejemplo.com"
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label
                htmlFor="auth-password"
                className="block text-xs font-medium text-slate-300"
              >
                Contraseña
              </label>
              <input
                id="auth-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tu contraseña"
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
              {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
