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
    <section
      aria-label="Contexto activo para el Coach"
      className="space-y-3 rounded-2xl border border-emerald-500/30 bg-emerald-950/25 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-emerald-300">
            Contexto activo para el Coach
          </h2>
          <p className="text-xs text-slate-300">
            Esto es exactamente lo que el Coach consulta en cada recomendación.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
            activeInjuries.length > 0
              ? "bg-amber-500/20 text-amber-200"
              : "bg-emerald-500/20 text-emerald-200"
          }`}
        >
          {activeInjuries.length === 0
            ? "Sin lesiones activas"
            : activeInjuries.length === 1
              ? "1 restricción activa"
              : `${activeInjuries.length} restricciones activas`}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-xl bg-slate-900/70 p-2.5">
          <dt className="text-slate-400">Objetivo</dt>
          <dd className="mt-0.5 font-medium text-white">
            {profile.primary_goal ? GOAL_LABELS[profile.primary_goal] : "Sin definir"}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-900/70 p-2.5">
          <dt className="text-slate-400">Biometría</dt>
          <dd className="mt-0.5 font-medium text-white">
            {profile.base_weight_kg ? `${profile.base_weight_kg} kg` : "Peso —"}
            {profile.height_cm ? ` · ${profile.height_cm} cm` : ""}
            {profile.age ? ` · ${profile.age} años` : ""}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-900/70 p-2.5">
          <dt className="text-slate-400">Disponibilidad</dt>
          <dd className="mt-0.5 font-medium text-white">
            {profile.training_days_per_week
              ? `${profile.training_days_per_week} días/sem`
              : "Sin definir"}
            {profile.session_duration_min ? ` · ${profile.session_duration_min} min` : ""}
          </dd>
        </div>
        <div className="rounded-xl bg-slate-900/70 p-2.5">
          <dt className="text-slate-400">Enfoque</dt>
          <dd className="mt-0.5 font-medium text-white">
            {profile.training_approach === "natural"
              ? "Natural"
              : APPROACH_LABELS[profile.training_approach]}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1.5 text-xs">
        {profile.experience_level && (
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
            Nivel: {EXPERIENCE_LABELS[profile.experience_level]}
          </span>
        )}
        {profile.equipment.length > 0 && (
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
            Equipo: {profile.equipment.join(", ")}
          </span>
        )}
        {profile.allergies.length > 0 && (
          <span className="rounded-full bg-rose-500/20 px-2.5 py-0.5 text-rose-200">
            Alergias: {profile.allergies.join(", ")}
          </span>
        )}
        {profile.food_preferences.length > 0 && (
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-slate-200">
            Nutrición: {profile.food_preferences.join(", ")}
          </span>
        )}
      </div>

      {activeInjuries.length > 0 && (
        <div className="space-y-1.5 border-t border-emerald-500/20 pt-2.5">
          <p className="text-xs font-medium text-amber-200">Restricciones físicas vigentes:</p>
          <ul className="flex flex-wrap gap-1.5">
            {activeInjuries.map((injury) => (
              <li
                key={injury.id}
                className="rounded-lg border border-amber-500/30 bg-amber-950/40 px-2.5 py-1 text-xs text-amber-100"
              >
                <span className="font-semibold">{injury.body_part}</span> (
                {SEVERITY_LABELS[injury.severity]}): {injury.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
