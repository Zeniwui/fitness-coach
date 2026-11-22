import { CheckCircle2, Trophy, X } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import type { SessionAchievementSummary } from "./progression";

interface SessionAchievementBannerProps {
  summary: SessionAchievementSummary;
  onDismiss: () => void;
}

export function SessionAchievementBanner({
  summary,
  onDismiss,
}: SessionAchievementBannerProps) {
  return (
    <Surface
      variant="accent"
      padded="md"
      role="status"
      aria-label="Resumen de la sesión guardada"
      className="space-y-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success-text" aria-hidden="true" />
            <h3 className="heading-section text-base text-ink">
              Resumen de la sesión guardada
            </h3>
          </div>
          <p className="text-xs text-ink-muted tabular-nums">
            {summary.effectiveSets} series efectivas registradas ({summary.totalSets} series totales
            guardadas en tu historial).
          </p>
        </div>

        <IconButton onClick={onDismiss} aria-label="Cerrar resumen de sesión">
          <X className="h-4 w-4" aria-hidden="true" />
        </IconButton>
      </div>

      {summary.personalRecords.length > 0 && (
        <div className="space-y-2 border-t border-accent/25 pt-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-text">
            <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {summary.personalRecords.length === 1
                ? "1 nuevo récord personal superado"
                : `${summary.personalRecords.length} nuevos récords personales superados`}
            </span>
          </p>
          <ul className="space-y-1.5">
            {summary.personalRecords.map((pr) => (
              <li
                key={pr.exerciseName}
                className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-accent/25 bg-surface px-3 py-2 text-xs"
              >
                <span className="font-semibold text-ink">{pr.exerciseName}</span>
                <div className="flex flex-wrap items-center gap-2 tabular-nums">
                  <span className="font-medium text-accent-text">
                    {pr.displayLoad} {pr.displayUnit} × {pr.displayReps}
                  </span>
                  {pr.newE1rmKg !== null && (
                    <Badge tone="accent">e1RM est. {pr.newE1rmKg} kg</Badge>
                  )}
                  <Badge tone="success">
                    {pr.kind === "both"
                      ? "Récord de carga y e1RM"
                      : pr.kind === "e1rm"
                        ? "Récord de e1RM"
                        : "Récord de carga"}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Surface>
  );
}
