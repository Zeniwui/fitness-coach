import { Badge } from "../../ui/Badge";
import { Surface } from "../../ui/Surface";
import {
  APPROACH_LABELS,
  EXPERIENCE_LABELS,
  GOAL_LABELS,
  type LivingProfileResponse,
  SEVERITY_LABELS,
} from "./labels";

interface ActiveCoachContextBannerProps {
  profile: LivingProfileResponse;
}

export function ActiveCoachContextBanner({ profile }: ActiveCoachContextBannerProps) {
  const activeInjuries = profile.injuries.filter((item) => item.status === "active");

  return (
    <section aria-label="Contexto activo para el Coach">
      <Surface variant="focal" padded="md" className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="heading-section text-lg text-ink">Contexto activo para el Coach</h2>
            <p className="text-xs text-ink-muted">
              Esto es exactamente lo que el Coach consulta en cada recomendación.
            </p>
          </div>
          <Badge tone={activeInjuries.length > 0 ? "warning" : "success"}>
            {activeInjuries.length === 0
              ? "Sin lesiones activas"
              : activeInjuries.length === 1
                ? "1 restricción activa"
                : `${activeInjuries.length} restricciones activas`}
          </Badge>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
          <div className="rounded-control border border-line bg-surface-muted/60 p-3">
            <dt className="text-ink-muted">Objetivo</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">
              {profile.primary_goal ? GOAL_LABELS[profile.primary_goal] : "Sin definir"}
            </dd>
          </div>
          <div className="rounded-control border border-line bg-surface-muted/60 p-3">
            <dt className="text-ink-muted">Biometría</dt>
            <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">
              {profile.base_weight_kg ? `${profile.base_weight_kg} kg` : "Peso —"}
              {profile.height_cm ? ` · ${profile.height_cm} cm` : ""}
              {profile.age ? ` · ${profile.age} años` : ""}
            </dd>
          </div>
          <div className="rounded-control border border-line bg-surface-muted/60 p-3">
            <dt className="text-ink-muted">Disponibilidad</dt>
            <dd className="mt-1 text-sm font-semibold text-ink tabular-nums">
              {profile.training_days_per_week
                ? `${profile.training_days_per_week} días/sem`
                : "Sin definir"}
              {profile.session_duration_min ? ` · ${profile.session_duration_min} min` : ""}
            </dd>
          </div>
          <div className="rounded-control border border-line bg-surface-muted/60 p-3">
            <dt className="text-ink-muted">Enfoque</dt>
            <dd className="mt-1 text-sm font-semibold text-ink">
              {profile.training_approach === "natural"
                ? "Natural"
                : APPROACH_LABELS[profile.training_approach]}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap gap-1.5 text-xs">
          {profile.experience_level && (
            <Badge tone="neutral">Nivel: {EXPERIENCE_LABELS[profile.experience_level]}</Badge>
          )}
          {profile.equipment.length > 0 && (
            <Badge tone="neutral">Equipo: {profile.equipment.join(", ")}</Badge>
          )}
          {profile.allergies.length > 0 && (
            <Badge tone="danger">Alergias: {profile.allergies.join(", ")}</Badge>
          )}
          {profile.food_preferences.length > 0 && (
            <Badge tone="accent">Nutrición: {profile.food_preferences.join(", ")}</Badge>
          )}
        </div>

        {activeInjuries.length > 0 && (
          <div className="space-y-2 border-t border-line pt-3">
            <p className="text-xs font-semibold text-warning-text">
              Restricciones físicas vigentes:
            </p>
            <ul className="flex flex-wrap gap-2">
              {activeInjuries.map((injury) => (
                <li
                  key={injury.id}
                  className="rounded-control border border-warning/35 bg-warning-soft px-3 py-1.5 text-xs text-warning-text"
                >
                  <span className="font-semibold">{injury.body_part}</span> (
                  {SEVERITY_LABELS[injury.severity]}): {injury.description}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Surface>
    </section>
  );
}
