import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { CoachPage } from "../features/coach/CoachPage";
import { NutritionPage } from "../features/nutrition/NutritionPage";
import { LivingProfilePage } from "../features/profile/LivingProfilePage";
import { SciencePage } from "../features/science/SciencePage";
import { TrainingPage } from "../features/training/TrainingPage";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { ClassicalMark } from "../ui/ClassicalMark";
import { AppearanceControls } from "./AppearanceControls";
import { BottomNav } from "./BottomNav";

function ProtectedLayout() {
  const { athlete, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas px-4 text-sm text-ink-muted">
        <ClassicalMark className="h-8 w-8 text-secondary" />
        <span>Cargando sesión…</span>
      </div>
    );
  }

  if (!athlete) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-canvas pb-20 lg:pb-10 lg:pl-64">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-control border border-line bg-surface-muted text-secondary lg:hidden">
              <ClassicalMark className="h-5 w-5" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">{athlete.display_name}</span>
              {athlete.is_curator && <Badge tone="secondary">Curador</Badge>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <AppearanceControls compact />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void logout()}
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Salir</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>

      <BottomNav />
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
