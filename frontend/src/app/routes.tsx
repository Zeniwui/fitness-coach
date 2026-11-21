import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { LoginPage } from "../features/auth/LoginPage";
import { CuratorInvitationsPanel } from "../features/auth/CuratorInvitationsPanel";
import { LivingProfilePage } from "../features/profile/LivingProfilePage";
import { BottomNav } from "./BottomNav";

function ProtectedLayout() {
  const { athlete, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">
        Cargando sesión…
      </div>
    );
  }

  if (!athlete) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen pb-20">
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Fitness Coach
            </p>
            <p className="text-sm font-medium text-white">
              {athlete.display_name}
              {athlete.is_curator && (
                <span className="ml-2 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Curador
                </span>
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-slate-500 hover:text-white"
          >
            Salir
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        <Outlet />
      </main>

      <BottomNav />
    </div>
  );
}

function CoachPlaceholder() {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-bold text-white">Coach</h1>
      <p className="text-sm text-slate-400">
        Conversaciones activas con tu Coach respaldadas por tu Perfil Vivo y la Base de Conocimiento curada.
      </p>
    </section>
  );
}

function TrainingPlaceholder() {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-bold text-white">Entreno</h1>
      <p className="text-sm text-slate-400">
        Mesociclo activo, sesión planificada de hoy y registro rápido de Sesiones de Entrenamiento.
      </p>
    </section>
  );
}

function NutritionPlaceholder() {
  return (
    <section className="space-y-2">
      <h1 className="text-xl font-bold text-white">Nutrición</h1>
      <p className="text-sm text-slate-400">
        Fase Nutricional activa y Check-in semanal guiado.
      </p>
    </section>
  );
}

function SciencePage() {
  const { athlete } = useAuth();
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-bold text-white">Ciencia — Base de Conocimiento</h1>
        <p className="text-sm text-slate-400">
          Explora las Fichas de Evidencia aprobadas mediante búsqueda híbrida.
        </p>
      </section>

      {athlete?.is_curator && <CuratorInvitationsPanel />}
    </div>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<ProtectedLayout />}>
        <Route path="/coach" element={<CoachPlaceholder />} />
        <Route path="/training" element={<TrainingPlaceholder />} />
        <Route path="/nutrition" element={<NutritionPlaceholder />} />
        <Route path="/science" element={<SciencePage />} />
        <Route path="/profile" element={<LivingProfilePage />} />
        <Route path="/" element={<Navigate to="/coach" replace />} />
        <Route path="*" element={<Navigate to="/coach" replace />} />
      </Route>
    </Routes>
  );
}
