import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { CuratorInvitationsPanel } from "../auth/CuratorInvitationsPanel";
import { MonthlyCutPanel } from "../monthly-cut/MonthlyCutPanel";
import { TrendingTopicsPanel } from "../monthly-cut/TrendingTopicsPanel";
import { PageHeader } from "../../ui/PageHeader";
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

  const tabs: Array<{ id: ScienceTab; label: string }> = [
    { id: "knowledge_base", label: "Base de Conocimiento" },
    { id: "trending_topics", label: "Temas de Actualidad" },
    ...(isCurator
      ? [
          { id: "curator_inbox" as const, label: "Bandeja del Curador" },
          { id: "monthly_cut" as const, label: "Corte Mensual" },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ciencia"
        description="Explora las Fichas de Evidencia aprobadas mediante búsqueda híbrida y consulta los Temas de Actualidad en su bloque independiente."
      />

      <div
        role="tablist"
        aria-label="Vistas de Ciencia"
        className="flex flex-wrap gap-1.5 rounded-panel border border-line bg-surface-muted/70 p-1"
      >
        {tabs.map((tab) => {
          const isSelected = resolvedTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[38px] rounded-control px-3.5 py-2 text-xs font-semibold transition-colors ${
                isSelected
                  ? "bg-surface text-ink shadow-sm"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {resolvedTab === "knowledge_base" && <KnowledgeExplorer isCurator={isCurator} />}
      {resolvedTab === "trending_topics" && <TrendingTopicsPanel isCurator={isCurator} />}
      {resolvedTab === "curator_inbox" && isCurator && <CuratorInbox />}
      {resolvedTab === "monthly_cut" && isCurator && <MonthlyCutPanel />}

      {isCurator && <CuratorInvitationsPanel />}
    </div>
  );
}
