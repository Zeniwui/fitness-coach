import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { CuratorInvitationsPanel } from "../auth/CuratorInvitationsPanel";
import { MonthlyCutPanel } from "../monthly-cut/MonthlyCutPanel";
import { TrendingTopicsPanel } from "../monthly-cut/TrendingTopicsPanel";
import { CuratorInbox } from "./CuratorInbox";
import { KnowledgeExplorer } from "./KnowledgeExplorer";

type ScienceTab = "knowledge_base" | "trending_topics" | "curator_inbox" | "monthly_cut";

export function SciencePage() {
  const { athlete } = useAuth();
  const isCurator = Boolean(athlete?.is_curator);
  const [activeTab, setActiveTab] = useState<ScienceTab>("knowledge_base");

  const resolvedTab: ScienceTab =
    !isCurator && (activeTab === "curator_inbox" || activeTab === "monthly_cut")
      ? "knowledge_base"
      : activeTab;

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-bold text-white">Ciencia</h1>
        <p className="text-sm text-slate-400">
          Explora las Fichas de Evidencia aprobadas mediante búsqueda híbrida y consulta los Temas
          de Actualidad en su bloque independiente.
        </p>
      </section>

      <div
        role="tablist"
        aria-label="Vistas de Ciencia"
        className="flex flex-wrap gap-2 border-b border-slate-800 pb-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={resolvedTab === "knowledge_base"}
          onClick={() => setActiveTab("knowledge_base")}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            resolvedTab === "knowledge_base"
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-900 text-slate-300 hover:text-white"
          }`}
        >
          Base de Conocimiento
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={resolvedTab === "trending_topics"}
          onClick={() => setActiveTab("trending_topics")}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
            resolvedTab === "trending_topics"
              ? "bg-emerald-500 text-slate-950"
              : "bg-slate-900 text-slate-300 hover:text-white"
          }`}
        >
          Temas de Actualidad
        </button>
        {isCurator && (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={resolvedTab === "curator_inbox"}
              onClick={() => setActiveTab("curator_inbox")}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                resolvedTab === "curator_inbox"
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-900 text-slate-300 hover:text-white"
              }`}
            >
              Bandeja del Curador
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={resolvedTab === "monthly_cut"}
              onClick={() => setActiveTab("monthly_cut")}
              className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
                resolvedTab === "monthly_cut"
                  ? "bg-emerald-500 text-slate-950"
                  : "bg-slate-900 text-slate-300 hover:text-white"
              }`}
            >
              Corte Mensual
            </button>
          </>
        )}
      </div>

      {resolvedTab === "knowledge_base" && <KnowledgeExplorer isCurator={isCurator} />}
      {resolvedTab === "trending_topics" && <TrendingTopicsPanel isCurator={isCurator} />}
      {resolvedTab === "curator_inbox" && isCurator && <CuratorInbox />}
      {resolvedTab === "monthly_cut" && isCurator && <MonthlyCutPanel />}

      {isCurator && <CuratorInvitationsPanel />}
    </div>
  );
}
