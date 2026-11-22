import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, Circle, X } from "lucide-react";
import { apiClient } from "../../api/client";
import { useAuth } from "../auth/AuthContext";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";

const DISMISS_STORAGE_PREFIX = "fc-onboarding-dismissed-v1:";

interface OnboardingStatus {
  hasProfile: boolean;
  hasActiveMesocycle: boolean;
  hasActivePhase: boolean;
}

interface OnboardingChecklistProps {
  hasCoachMessages: boolean;
  onFocusComposer: () => void;
}

function getStorageKey(athleteId: string | undefined, email: string | undefined): string | null {
  const id = athleteId || email;
  return id ? `${DISMISS_STORAGE_PREFIX}${id}` : null;
}

function readDismissed(key: string | null): boolean {
  if (!key) return false;
  try {
    return window.localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeDismissed(key: string | null): void {
  if (!key) return;
  try {
    window.localStorage.setItem(key, "1");
  } catch {
    // Ignore storage quota or private-mode restrictions.
  }
}

export function OnboardingChecklist({
  hasCoachMessages,
  onFocusComposer,
}: OnboardingChecklistProps) {
  const { athlete } = useAuth();
  const storageKey = getStorageKey(athlete?.athlete_id, athlete?.email);
  const [dismissed, setDismissed] = useState<boolean>(() => readDismissed(storageKey));
  const [status, setStatus] = useState<OnboardingStatus | null>(null);

  useEffect(() => {
    setDismissed(readDismissed(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (dismissed || !athlete) return;
    let active = true;

    async function loadSetupStatus() {
      const [profileRes, todayRes, phasesRes] = await Promise.all([
        apiClient.GET("/api/v1/profile").catch(() => ({ data: undefined })),
        apiClient.GET("/api/v1/training/today").catch(() => ({ data: undefined })),
        apiClient.GET("/api/v1/nutrition/phases").catch(() => ({ data: undefined })),
      ]);

      if (!active) return;

      const hasProfile = Boolean(profileRes.data?.has_saved_profile);
      const hasActiveMesocycle = Boolean(todayRes.data?.active_mesocycle);
      const hasActivePhase = Boolean(
        Array.isArray(phasesRes.data) && phasesRes.data.some((phase) => phase.status === "active"),
      );

      setStatus({
        hasProfile,
        hasActiveMesocycle,
        hasActivePhase,
      });
    }

    void loadSetupStatus();
    return () => {
      active = false;
    };
  }, [athlete, dismissed]);

  if (dismissed || !status) return null;

  const prerequisitesDone =
    status.hasProfile && status.hasActiveMesocycle && status.hasActivePhase;
  if (prerequisitesDone) return null;

  const completedCount =
    (status.hasProfile ? 1 : 0) +
    (status.hasActiveMesocycle ? 1 : 0) +
    (status.hasActivePhase ? 1 : 0) +
    (hasCoachMessages ? 1 : 0);

  function handleDismiss() {
    writeDismissed(storageKey);
    setDismissed(true);
  }

  return (
    <section aria-label="Primeros pasos">
      <Surface variant="focal" padded="md" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="heading-section text-lg text-ink">Primeros pasos</h2>
            <p className="text-xs leading-relaxed text-ink-muted tabular-nums">
              {completedCount} de 4 completados. Configura tu contexto para que el Coach adapte cada
              decisión a tu historial.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Ocultar primeros pasos"
            onClick={handleDismiss}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ocultar</span>
          </Button>
        </div>

        <ol className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <li className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-muted/50 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              {status.hasProfile ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              )}
              <span
                className={`text-xs font-medium ${
                  status.hasProfile ? "text-ink-muted" : "text-ink"
                }`}
              >
                {status.hasProfile ? "Perfil Vivo completado" : "Perfil Vivo"}
              </span>
            </div>
            {!status.hasProfile && (
              <Link
                to="/profile"
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-control px-2.5 text-xs font-semibold text-accent-text transition-colors hover:bg-accent-soft sm:min-h-[32px]"
              >
                <span>Completar Perfil Vivo</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </li>

          <li className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-muted/50 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              {status.hasActiveMesocycle ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              )}
              <span
                className={`text-xs font-medium ${
                  status.hasActiveMesocycle ? "text-ink-muted" : "text-ink"
                }`}
              >
                {status.hasActiveMesocycle ? "Mesociclo activo" : "Mesociclo"}
              </span>
            </div>
            {!status.hasActiveMesocycle && (
              <Link
                to="/training"
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-control px-2.5 text-xs font-semibold text-accent-text transition-colors hover:bg-accent-soft sm:min-h-[32px]"
              >
                <span>Configurar Mesociclo</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </li>

          <li className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-muted/50 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              {status.hasActivePhase ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              )}
              <span
                className={`text-xs font-medium ${
                  status.hasActivePhase ? "text-ink-muted" : "text-ink"
                }`}
              >
                {status.hasActivePhase ? "Fase Nutricional activa" : "Fase Nutricional"}
              </span>
            </div>
            {!status.hasActivePhase && (
              <Link
                to="/nutrition"
                className="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded-control px-2.5 text-xs font-semibold text-accent-text transition-colors hover:bg-accent-soft sm:min-h-[32px]"
              >
                <span>Activar Fase Nutricional</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            )}
          </li>

          <li className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface-muted/50 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2">
              {hasCoachMessages ? (
                <CheckCircle2 className="h-4 w-4 shrink-0 text-success-text" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 shrink-0 text-ink-subtle" aria-hidden="true" />
              )}
              <span
                className={`text-xs font-medium ${
                  hasCoachMessages ? "text-ink-muted" : "text-ink"
                }`}
              >
                {hasCoachMessages ? "Primera consulta iniciada" : "Primera consulta al Coach"}
              </span>
            </div>
            {!hasCoachMessages && (
              <Button variant="soft" size="sm" onClick={onFocusComposer}>
                <span>Escribir al Coach</span>
              </Button>
            )}
          </li>
        </ol>
      </Surface>
    </section>
  );
}
