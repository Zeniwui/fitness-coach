import { NavLink } from "react-router-dom";
import {
  MessageSquare,
  Dumbbell,
  Utensils,
  FlaskConical,
  UserCheck,
} from "lucide-react";

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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-800 bg-slate-950/95 backdrop-blur"
    >
      <div className="mx-auto grid max-w-3xl grid-cols-5">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition ${
                isActive
                  ? "text-emerald-400"
                  : "text-slate-400 hover:text-slate-200"
              }`
            }
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
