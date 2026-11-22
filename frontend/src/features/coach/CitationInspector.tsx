import { X } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";
import { EVIDENCE_LEVEL_LABELS, VALIDITY_LABELS } from "../science/labels";
import type { CitationItem } from "./sse";

interface CitationInspectorProps {
  citation: CitationItem;
  onClose: () => void;
}

export function CitationInspector({ citation, onClose }: CitationInspectorProps) {
  return (
    <aside aria-label="Detalle de Ficha de Evidencia">
      <Surface variant="focal" padded="sm" className="space-y-3 text-xs shadow-elevated">
        <div className="flex items-start justify-between gap-2">
          <p className="heading-section text-base text-ink">{citation.title}</p>
          <IconButton onClick={onClose} aria-label="Cerrar inspector de evidencia">
            <X className="h-4 w-4" aria-hidden="true" />
            <span>Cerrar</span>
          </IconButton>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="secondary">
            {EVIDENCE_LEVEL_LABELS[citation.evidence_level] ?? citation.evidence_level}
          </Badge>
          <Badge tone={citation.validity_status === "active" ? "success" : "warning"}>
            {VALIDITY_LABELS[citation.validity_status] ?? citation.validity_status}
          </Badge>
        </div>
        {citation.doi && (
          <p className="break-all font-mono text-xs text-ink-muted">DOI: {citation.doi}</p>
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
