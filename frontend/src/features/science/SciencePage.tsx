import { Suspense, lazy, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { TrendingTopicsPanel } from "../monthly-cut/TrendingTopicsPanel";
import { PageHeader } from "../../ui/PageHeader";
import { SegmentedTabs, type SegmentedTabItem } from "../../ui/SegmentedTabs";
import { KnowledgeExplorer } from "./KnowledgeExplorer";

const CuratorInbox = lazy(() =>
  import("./CuratorInbox").then((m) => ({ default: m.CuratorInbox })),
);
const MonthlyCutPanel = lazy(() =>
  import("../monthly-cut/MonthlyCutPanel").then((m) => ({ default: m.MonthlyCutPanel })),
);
const CuratorInvitationsPanel = lazy(() =>
  import("../auth/CuratorInvitationsPanel").then((m) => ({
    default: m.CuratorInvitationsPanel,
  })),
);

type ScienceTab =
  | "knowledge_base"
  | "trending_topics"
  | "curator_inbox"
  | "monthly_cut"
  | "invitations";

export function SciencePage() {
  const { athlete } = useAuth();
  const isCurator = Boolean(athlete?.is_curator);
  const [activeTab, setActiveTab] = useState<ScienceTab>("knowledge_base");

  const resolvedTab: ScienceTab =
    !isCurator &&
    (activeTab === "curator_inbox" ||
      activeTab === "monthly_cut" ||
      activeTab === "invitations")
      ? "knowledge_base"
      : activeTab;

  const tabs: Array<SegmentedTabItem<ScienceTab>> = [
    { id: "knowledge_base", label: "Base de Conocimiento" },
    { id: "trending_topics", label: "Temas de Actualidad" },
    ...(isCurator
      ? [
          { id: "curator_inbox" as const, label: "Bandeja del Curador" },
          { id: "monthly_cut" as const, label: "Corte Mensual" },
          { id: "invitations" as const, label: "Invitaciones" },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ciencia"
        description="Explora las Fichas de Evidencia aprobadas por texto o siglas científicas y consulta los Temas de Actualidad en su bloque independiente."
      />

      <SegmentedTabs
        items={tabs}
        activeId={resolvedTab}
        onChange={setActiveTab}
        ariaLabel="Vistas de Ciencia"
        idPrefix="science"
      />

      <div
        id={`science-panel-${resolvedTab}`}
        role="tabpanel"
        aria-labelledby={`science-tab-${resolvedTab}`}
      >
        <Suspense
          fallback={
            <p role="status" className="text-sm text-ink-muted">
              Cargando vista…
            </p>
          }
        >
          {resolvedTab === "knowledge_base" && <KnowledgeExplorer isCurator={isCurator} />}
          {resolvedTab === "trending_topics" && <TrendingTopicsPanel isCurator={isCurator} />}
          {resolvedTab === "curator_inbox" && isCurator && <CuratorInbox />}
          {resolvedTab === "monthly_cut" && isCurator && <MonthlyCutPanel />}
          {resolvedTab === "invitations" && isCurator && <CuratorInvitationsPanel />}
        </Suspense>
      </div>
    </div>
  );
}
