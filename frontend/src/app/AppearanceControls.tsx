import { Moon, Sun } from "lucide-react";
import { VISUAL_DIRECTIONS, useTheme } from "../theme/ThemeContext";

export function AppearanceControls({ compact = false }: { compact?: boolean }) {
  const { direction, setDirection, mode, toggleMode } = useTheme();

  return (
    <div
      className="flex items-center gap-1.5"
      role="group"
      aria-label="Apariencia y dirección visual"
    >
      <div
        role="group"
        aria-label="Dirección visual"
        className="inline-flex items-center rounded-control border border-line bg-surface-muted/80 p-0.5"
      >
        {VISUAL_DIRECTIONS.map((item) => {
          const active = direction === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setDirection(item.id)}
              aria-pressed={active}
              title={`${item.label}: ${item.description}`}
              className={`rounded-[calc(var(--radius-control)-2px)] px-2 py-1 text-xs font-medium transition-colors ${
                active
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {compact ? item.shortLabel : item.shortLabel}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={toggleMode}
        aria-label={mode === "light" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
        title={mode === "light" ? "Activar tema oscuro" : "Activar tema claro"}
        className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
      >
        {mode === "light" ? (
          <Moon className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Sun className="h-4 w-4" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
