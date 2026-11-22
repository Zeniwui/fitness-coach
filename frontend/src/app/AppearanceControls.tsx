import { Moon, Sun } from "lucide-react";
import { useTheme } from "../theme/ThemeContext";
import { Button } from "../ui/Button";

export function AppearanceControls() {
  const { mode, toggleMode } = useTheme();
  const isDark = mode === "dark";

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={toggleMode}
      aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}
      title={isDark ? "Activar tema claro" : "Activar tema oscuro"}
      className="min-w-[44px] px-2.5 font-medium text-ink-muted hover:text-ink sm:min-w-0"
    >
      {isDark ? (
        <>
          <Sun className="h-4 w-4 text-accent-text sm:h-3.5 sm:w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Claro</span>
        </>
      ) : (
        <>
          <Moon className="h-4 w-4 text-accent-text sm:h-3.5 sm:w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">Oscuro</span>
        </>
      )}
    </Button>
  );
}
