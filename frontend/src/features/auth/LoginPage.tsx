import { useState, type FormEvent } from "react";
import { AppearanceControls } from "../../app/AppearanceControls";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { ClassicalMark } from "../../ui/ClassicalMark";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
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
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface text-accent-text">
            <ClassicalMark className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            Fitness Coach
          </span>
        </div>
        <AppearanceControls />
      </div>

      <main className="mx-auto grid min-h-[calc(100vh-76px)] max-w-5xl grid-cols-1 items-center gap-8 px-4 py-8 sm:px-6 lg:grid-cols-12">
        <section className="hidden space-y-6 lg:col-span-6 lg:block">
          <div className="h-1 w-12 rounded-full bg-accent" aria-hidden="true" />
          <div className="space-y-4">
            <h2 className="heading-display text-3xl text-ink sm:text-4xl">
              Entrenamiento de fuerza y nutrición guiados por evidencia curada
            </h2>
            <p className="max-w-md text-sm leading-relaxed text-ink-muted">
              Un espacio privado para Atletas y Curadores donde tu Perfil Vivo, cada Mesociclo y
              la Base de Conocimiento científica conviven con rigor y claridad.
            </p>
          </div>
          <dl className="grid max-w-md grid-cols-2 gap-4 border-t border-line pt-5 text-sm">
            <div>
              <dt className="font-semibold text-secondary-text">Base de Conocimiento</dt>
              <dd className="mt-1 text-xs leading-relaxed text-ink-muted">
                Fichas de Evidencia verificadas con nivel metodológico y control de vigencia.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-accent-text">Coaching persistente</dt>
              <dd className="mt-1 text-xs leading-relaxed text-ink-muted">
                Decisiones adaptadas a tu biometría, historial de sesiones y restricciones físicas.
              </dd>
            </div>
          </dl>
        </section>

        <div className="mx-auto w-full max-w-md lg:col-span-6 lg:ml-auto lg:mr-0">
          <Surface variant="classical" padded="lg" className="shadow-elevated">
            <div className="classical-entablature pb-4">
              <h1 className="heading-display text-2xl text-ink">
                Acceso privado por invitación
              </h1>
              <p className="mt-2 text-sm text-ink-muted">
                El registro público está deshabilitado. Inicia sesión con tu correo electrónico y
                contraseña autorizados.
              </p>
            </div>

            {status === "unconfigured" ? (
              <AlertBanner tone="warning" className="mt-5 text-xs">
                <p className="font-semibold">
                  Falta configurar Supabase Auth en la PWA
                </p>
                <p className="mt-1">
                  Define las variables públicas faltantes en el entorno del frontend antes de
                  iniciar sesión:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-4 font-mono">
                  {missingEnvVars.map((envVar) => (
                    <li key={envVar}>{envVar}</li>
                  ))}
                </ul>
              </AlertBanner>
            ) : status === "needs_activation" ? (
              <ActivationPanel />
            ) : (
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="auth-email"
                    className="block text-xs font-medium text-ink-muted"
                  >
                    Correo electrónico
                  </label>
                  <Input
                    id="auth-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="atleta@ejemplo.com"
                    className="mt-1.5"
                  />
                </div>

                <div>
                  <label
                    htmlFor="auth-password"
                    className="block text-xs font-medium text-ink-muted"
                  >
                    Contraseña
                  </label>
                  <Input
                    id="auth-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tu contraseña"
                    className="mt-1.5"
                  />
                </div>

                {error && <AlertBanner tone="error">{error}</AlertBanner>}

                <Button type="submit" size="lg" fullWidth disabled={submitting}>
                  {submitting ? "Iniciando sesión…" : "Iniciar sesión"}
                </Button>
              </form>
            )}
          </Surface>
        </div>
      </main>
    </div>
  );
}
