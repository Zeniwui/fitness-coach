import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { CuratorInvitationsPanel } from "../auth/CuratorInvitationsPanel";
import { CuratorInbox } from "./CuratorInbox";
import { KnowledgeExplorer } from "./KnowledgeExplorer";

type ScienceTab = "knowledge_base" | "curator_inbox";

export function SciencePage() {
  const { athlete } = useAuth();
  const isCurator = Boolean(athlete?.is_curator);
  const [activeTab, setActiveTab] = useState<ScienceTab>("knowledge_base");

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h1 className="text-xl font-bold text-white">Ciencia — Base de Conocimiento</h1>
        <p className="text-sm text-slate-400">
          Explora las Fichas de Evidencia aprobadas mediante búsqueda híbrida.
        </p>
      </section>

      {isCurator && (
        <div
          role="tablist"
          aria-label="Vistas de Ciencia"
          className="flex gap-2 border-b border-slate-800 pb-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "knowledge_base"}
            onClick={() => setActiveTab("knowledge_base")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === "knowledge_base"
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:text-white"
            }`}
          >
            Base de Conocimiento
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "curator_inbox"}
            onClick={() => setActiveTab("curator_inbox")}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold transition ${
              activeTab === "curator_inbox"
                ? "bg-emerald-500 text-slate-950"
                : "bg-slate-900 text-slate-300 hover:text-white"
            }`}
          >
            Bandeja del Curador
          </button>
        </div>
      )}

      {activeTab === "knowledge_base" || !isCurator ? (
        <KnowledgeExplorer isCurator={isCurator} />
      ) : (
        <CuratorInbox />
      )}

      {isCurator && <CuratorInvitationsPanel />}
    </div>
  );
}
