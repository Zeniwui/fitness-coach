import { X } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Surface } from "../../ui/Surface";
import { EVIDENCE_LEVEL_LABELS, VALIDITY_LABELS } from "./ChatMessageCard";
import type { CitationItem } from "./sse";

interface CitationInspectorProps {
  citation: CitationItem;
  onClose: () => void;
}

export function CitationInspector({ citation, onClose }: CitationInspectorProps) {
  return (
    <aside aria-label="Detalle de Ficha de Evidencia">
      <Surface variant="classical" padded="sm" className="space-y-2.5 text-xs">
        <div className="flex items-start justify-between gap-2">
          <p className="heading-section text-base text-ink">{citation.title}</p>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-control px-1.5 py-1 text-xs text-ink-muted hover:bg-surface-muted hover:text-ink"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Cerrar</span>
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="secondary">
            {EVIDENCE_LEVEL_LABELS[citation.evidence_level] ?? citation.evidence_level}
          </Badge>
          <Badge tone={citation.validity_status === "active" ? "success" : "warning"}>
            {VALIDITY_LABELS[citation.validity_status] ?? citation.validity_status}
          </Badge>
        </div>
        <p className="text-ink-muted">
          Nivel: {EVIDENCE_LEVEL_LABELS[citation.evidence_level] ?? citation.evidence_level} ·
          Estado: {VALIDITY_LABELS[citation.validity_status] ?? citation.validity_status}
        </p>
        {citation.doi && (
          <p className="break-all font-mono text-[11px] text-ink-muted">DOI: {citation.doi}</p>
        )}
        {citation.superseded_by_title && (
          <p className="rounded-control bg-warning-soft px-2.5 py-1.5 text-warning-text">
            Actualizada por: {citation.superseded_by_title}
          </p>
        )}
      </Surface>
    </aside>
  );
}
