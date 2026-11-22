import { NavLink } from "react-router-dom";
import {
  MessageSquare,
  Dumbbell,
  Utensils,
  FlaskConical,
  UserCheck,
} from "lucide-react";
import { BrandMark } from "../ui/BrandMark";

const NAV_ITEMS = [
  { to: "/coach", label: "Coach", icon: MessageSquare },
  { to: "/training", label: "Entrenamiento", icon: Dumbbell },
  { to: "/nutrition", label: "Nutrición", icon: Utensils },
  { to: "/science", label: "Ciencia", icon: FlaskConical },
  { to: "/profile", label: "Perfil Vivo", icon: UserCheck },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:inset-y-0 lg:right-auto lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-t-0 lg:border-rail-border lg:bg-rail lg:pb-0 lg:text-rail-ink"
    >
      {/* Desktop Brand Header inside the single semantic navigation rail */}
      <div className="hidden lg:block">
        <div className="px-5 pb-5 pt-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-control border border-rail-border bg-rail-surface text-rail-active-ink">
              <BrandMark className="h-6 w-6" />
            </div>
            <div>
              <p className="font-display text-lg font-bold leading-none tracking-tight text-rail-ink">
                Fitness Coach
              </p>
              <p className="mt-1 text-xs text-rail-muted">
                Entrenamiento y ciencia
              </p>
            </div>
          </div>
        </div>
        <div className="mx-5 mb-4 border-t border-rail-border" />
      </div>

      {/* Single set of navigation links: horizontal 5-col on mobile, vertical stack on desktop */}
      <div className="mx-auto grid w-full max-w-3xl grid-cols-5 lg:mx-0 lg:flex lg:flex-1 lg:flex-col lg:gap-1 lg:px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `relative flex min-h-[52px] flex-col items-center justify-center gap-1 px-1 py-2 text-xs font-medium transition-colors lg:min-h-[40px] lg:flex-row lg:justify-start lg:gap-3 lg:rounded-control lg:px-3.5 lg:py-2.5 lg:text-sm ${
                isActive
                  ? "text-accent-text lg:bg-rail-active lg:text-rail-active-ink"
                  : "text-ink-muted hover:text-ink lg:text-rail-muted lg:hover:bg-rail-surface lg:hover:text-rail-ink"
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-accent lg:inset-x-auto lg:inset-y-2 lg:left-0 lg:h-auto lg:w-0.5 lg:bg-rail-active-ink"
                  />
                )}
                <Icon className="h-5 w-5 shrink-0 lg:h-[18px] lg:w-[18px]" aria-hidden="true" />
                <span className="max-w-full truncate">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      <div className="hidden border-t border-rail-border px-5 py-4 lg:block">
        <p className="text-xs font-semibold text-rail-ink">Evidencia y progresión</p>
        <p className="mt-0.5 text-xs leading-snug text-rail-muted">
          Hipertrofia, nutrición y literatura curada en un mismo cuaderno.
        </p>
      </div>
    </nav>
  );
}
