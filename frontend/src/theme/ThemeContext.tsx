import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type VisualDirection = "ateneo" | "clinico" | "hierro";
export type ThemeMode = "light" | "dark";

export const VISUAL_DIRECTIONS: ReadonlyArray<{
  id: VisualDirection;
  shortLabel: string;
  label: string;
  description: string;
}> = [
  {
    id: "ateneo",
    shortLabel: "Ateneo",
    label: "Ateneo Deportivo",
    description: "Armonía clásica, proporción y contraste marino",
  },
  {
    id: "clinico",
    shortLabel: "Clínico",
    label: "Instrumento Clínico",
    description: "Precisión biomecánica y claridad de laboratorio",
  },
  {
    id: "hierro",
    shortLabel: "Hierro",
    label: "Cuaderno de Hierro",
    description: "Acero técnico, latón calibrado y foco en cargas",
  },
];

const DIRECTION_STORAGE_KEY = "fc-visual-direction";
const THEME_STORAGE_KEY = "fc-theme-mode";

const THEME_COLORS: Record<VisualDirection, Record<ThemeMode, string>> = {
  ateneo: { light: "#0E2236", dark: "#0E1621" },
  clinico: { light: "#F6F7F9", dark: "#11151C" },
  hierro: { light: "#EFF1F4", dark: "#14171D" },
};

function readInitialDirection(): VisualDirection {
  try {
    const stored = window.localStorage.getItem(DIRECTION_STORAGE_KEY);
    if (stored === "ateneo" || stored === "clinico" || stored === "hierro") {
      return stored;
    }
  } catch {
    // Ignore storage unavailability
  }
  return "ateneo";
}

function readInitialMode(): ThemeMode {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Ignore storage unavailability
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
  }
  return "light";
}

interface ThemeContextValue {
  direction: VisualDirection;
  mode: ThemeMode;
  setDirection: (next: VisualDirection) => void;
  setMode: (next: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [direction, setDirectionState] = useState<VisualDirection>(readInitialDirection);
  const [mode, setModeState] = useState<ThemeMode>(readInitialMode);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-direction", direction);
    root.setAttribute("data-theme", mode);

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute("content", THEME_COLORS[direction][mode]);
    }
  }, [direction, mode]);

  const setDirection = useCallback((next: VisualDirection) => {
    setDirectionState(next);
    try {
      window.localStorage.setItem(DIRECTION_STORAGE_KEY, next);
    } catch {
      // Ignore storage unavailability
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Ignore storage unavailability
    }
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next: ThemeMode = prev === "light" ? "dark" : "light";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Ignore storage unavailability
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ direction, mode, setDirection, setMode, toggleMode }),
    [direction, mode, setDirection, setMode, toggleMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used inside ThemeProvider");
  }
  return ctx;
}
