import { Suspense, lazy } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { Badge } from "../ui/Badge";
import { BrandMark } from "../ui/BrandMark";
import { Button } from "../ui/Button";
import { AppearanceControls } from "./AppearanceControls";
import { BottomNav } from "./BottomNav";

const CoachPage = lazy(() =>
  import("../features/coach/CoachPage").then((m) => ({ default: m.CoachPage })),
);
const TrainingPage = lazy(() =>
  import("../features/training/TrainingPage").then((m) => ({ default: m.TrainingPage })),
);
const NutritionPage = lazy(() =>
  import("../features/nutrition/NutritionPage").then((m) => ({ default: m.NutritionPage })),
);
const SciencePage = lazy(() =>
  import("../features/science/SciencePage").then((m) => ({ default: m.SciencePage })),
);
const LivingProfilePage = lazy(() =>
  import("../features/profile/LivingProfilePage").then((m) => ({
    default: m.LivingProfilePage,
  })),
);

function RouteLoadingFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[40vh] items-center justify-center text-sm text-ink-muted"
    >
      Cargando vista…
    </div>
  );
}

function ProtectedLayout() {
  const { athlete, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-4 text-sm text-ink-muted">
        <BrandMark className="h-8 w-8 text-accent-text" />
        <span>Cargando sesión…</span>
      </div>
    );
  }

  if (!athlete) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-canvas pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-10 lg:pl-64">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-control focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-ink focus:shadow-elevated"
      >
        Saltar al contenido principal
      </a>

      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-control border border-line bg-surface-muted text-accent-text lg:hidden">
              <BrandMark className="h-5 w-5" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{athlete.display_name}</span>
              {athlete.is_curator && <Badge tone="secondary">Curador</Badge>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AppearanceControls />
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <BottomNav />

      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-6xl px-4 py-6 focus:outline-none sm:px-6 lg:px-8 lg:py-8"
      >
        <Suspense fallback={<RouteLoadingFallback />}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<ProtectedLayout />}>
        <Route path="/coach" element={<CoachPage />} />
        <Route path="/training" element={<TrainingPage />} />
        <Route path="/nutrition" element={<NutritionPage />} />
        <Route path="/science" element={<SciencePage />} />
        <Route path="/profile" element={<LivingProfilePage />} />
        <Route path="/" element={<Navigate to="/coach" replace />} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Route>
    </Routes>
  );
}
