import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";

export function AppearanceControls() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";

  return (
    <button
      type="button"
      onClick={toggleMode}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={isDark ? "Activar tema claro" : "Activar tema oscuro"}
      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-ink/40 hover:text-ink"
    >
      {isDark ? (
        <>
          <Sun className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
          <span className="hidden sm:inline">Claro</span>
        </>
      ) : (
        <>
          <Moon className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
          <span className="hidden sm:inline">Oscuro</span>
        </>
      )}
    </button>
  );
}
