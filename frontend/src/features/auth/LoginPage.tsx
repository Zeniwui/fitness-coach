import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { AppearanceControls } from "../../app/AppearanceControls";
import { AlertBanner } from "../../ui/AlertBanner";
import { BrandMark } from "../../ui/BrandMark";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import { ActivationPanel } from "./ActivationPanel";
import { useAuth } from "./AuthContext";

export function LoginPage() {
  const { status, missingEnvVars, pendingInviteCode, signInWithPassword, error } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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

  const errorId = error ? "login-error-message" : undefined;

  return (
    <div className="min-h-screen bg-canvas">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-control border border-line bg-surface text-accent-text">
            <BrandMark className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-ink">
            Fitness Coach
          </span>
        </div>
        <AppearanceControls />
      </header>

      <main className="mx-auto grid min-h-[calc(100vh-76px)] max-w-5xl grid-cols-1 items-center gap-6 px-4 py-6 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:py-8">
        <section className="space-y-4 lg:col-span-6 lg:space-y-6">
          <div className="h-1 w-12 rounded-full bg-accent" aria-hidden="true" />
          <div className="space-y-3 lg:space-y-4">
            <h1 className="heading-display text-2xl text-ink sm:text-3xl lg:text-4xl">
              Entrenamiento de fuerza y nutrición guiados por evidencia curada
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-ink-muted">
              Un espacio privado para Atletas y Curadores donde tu Perfil Vivo, cada Mesociclo y la
              Base de Conocimiento científica conviven con rigor y claridad.
            </p>
          </div>
          <dl className="hidden max-w-md grid-cols-2 gap-4 border-t border-line pt-5 text-sm lg:grid">
            <div>
              <dt className="font-semibold text-secondary-text">Base de Conocimiento</dt>
              <dd className="mt-1 text-xs leading-relaxed text-ink-muted">
                Fichas de Evidencia con nivel metodológico y vigencia curada.
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-accent-text">Coaching persistente</dt>
              <dd className="mt-1 text-xs leading-relaxed text-ink-muted">
                Decisiones adaptadas a tu biometría, historial y restricciones.
              </dd>
            </div>
          </dl>
        </section>

        <div className="mx-auto w-full max-w-md lg:col-span-6 lg:ml-auto lg:mr-0">
          <Surface variant="focal" padded="lg" className="shadow-elevated">
            <div className="section-rule pb-4">
              <h2 className="heading-display text-2xl text-ink">Acceso privado por invitación</h2>
              <p className="mt-2 text-sm text-ink-muted">
                El registro público está deshabilitado. Inicia sesión con tu correo electrónico y
                contraseña autorizados.
              </p>
            </div>

            {pendingInviteCode && status === "unauthenticated" && (
              <AlertBanner tone="info" className="mt-4 text-xs">
                Invitación detectada. Inicia sesión con tu cuenta para completar la activación.
              </AlertBanner>
            )}

            {status === "unconfigured" ? (
              <AlertBanner tone="warning" className="mt-5 text-xs">
                <p className="font-semibold">Falta configurar Supabase Auth en la PWA</p>
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
                    aria-invalid={Boolean(error)}
                    aria-describedby={errorId}
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
                  <div className="relative mt-1.5 flex items-center">
                    <Input
                      id="auth-password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      aria-invalid={Boolean(error)}
                      aria-describedby={errorId}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Tu contraseña"
                      className="pr-12"
                    />
                    <IconButton
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? "Ocultar clave" : "Mostrar clave"}
                      aria-pressed={showPassword}
                      className="absolute right-0.5"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </IconButton>
                  </div>
                </div>

                {error && (
                  <div id="login-error-message">
                    <AlertBanner tone="error">{error}</AlertBanner>
                  </div>
                )}

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
