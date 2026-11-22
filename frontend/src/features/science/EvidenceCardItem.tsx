import { ExternalLink } from "lucide-react";
import type { components } from "../../api/generated/schema";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Select, Textarea } from "../../ui/Field";
import {
  EVIDENCE_LEVEL_LABELS,
  VALIDITY_LABELS,
  VALIDITY_TONES,
  type ValidityStatus,
} from "./labels";

export type EvidenceSearchHit = components["schemas"]["EvidenceSearchHitResponse"];

interface EvidenceCardItemProps {
  hit: EvidenceSearchHit;
  isCurator: boolean;
  isEditing: boolean;
  editNotes: string;
  editValidity: ValidityStatus;
  onStartEdit: (hit: EvidenceSearchHit) => void;
  onEditNotesChange: (value: string) => void;
  onEditValidityChange: (value: ValidityStatus) => void;
  onSaveEdit: (cardId: string) => void;
  onCancelEdit: () => void;
}

export function EvidenceCardItem({
  hit,
  isCurator,
  isEditing,
  editNotes,
  editValidity,
  onStartEdit,
  onEditNotesChange,
  onEditValidityChange,
  onSaveEdit,
  onCancelEdit,
}: EvidenceCardItemProps) {
  const { card } = hit;

  return (
    <li className="space-y-3.5 rounded-panel border border-line bg-surface p-5 shadow-panel sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={VALIDITY_TONES[card.validity_status]}>
          {VALIDITY_LABELS[card.validity_status]}
        </Badge>
        <Badge tone="secondary">
          {EVIDENCE_LEVEL_LABELS[card.evidence_level] ?? card.evidence_level}
        </Badge>
        <Badge tone="neutral">
          {card.coverage === "full_text" ? "Texto completo" : "Solo abstract"}
        </Badge>
      </div>

      <h2 className="heading-section max-w-[46ch] text-xl text-ink">{card.title}</h2>
      <p className="max-w-[68ch] text-sm leading-relaxed text-ink-muted">
        {card.curated_text_es}
      </p>

      {hit.updated_by_cards.length > 0 && (
        <div className="max-w-[68ch] rounded-control border border-warning/35 bg-warning-soft/75 px-3.5 py-2 text-xs text-warning-text">
          <span className="font-semibold">Actualizada por: </span>
          {hit.updated_by_cards.map((u) => u.title).join(" · ")}
        </div>
      )}

      {card.curator_notes && (
        <p className="max-w-[68ch] text-xs leading-relaxed text-ink-muted">
          <span className="font-semibold text-ink">Notas del Curador:</span> {card.curator_notes}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        {card.tags.map((tag) => (
          <Badge key={tag} tone="accent">
            #{tag}
          </Badge>
        ))}
        {card.key_terms_en.map((term) => (
          <Badge key={term} tone="neutral">
            {term}
          </Badge>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
        <div className="flex flex-wrap items-center gap-3 text-ink-muted">
          {card.doi && <span className="break-all font-mono text-xs">DOI: {card.doi}</span>}
          {card.source_url && (
            <a
              href={card.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-accent-text hover:underline sm:min-h-[32px]"
            >
              <span>Abrir DOI / PubMed</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>

        {isCurator && !isEditing && (
          <Button variant="secondary" size="sm" onClick={() => onStartEdit(hit)}>
            Editar notas / vigencia
          </Button>
        )}
      </div>

      {isCurator && isEditing && (
        <div className="space-y-3 rounded-control border border-line bg-surface-muted/70 p-3.5">
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Notas del Curador</span>
            <Textarea
              compact
              value={editNotes}
              onChange={(e) => onEditNotesChange(e.target.value)}
              rows={2}
            />
          </label>
          <label className="block space-y-1 text-xs font-medium text-ink-muted">
            <span>Vigencia</span>
            <Select
              compact
              value={editValidity}
              onChange={(e) => onEditValidityChange(e.target.value as ValidityStatus)}
            >
              {(Object.keys(VALIDITY_LABELS) as ValidityStatus[]).map((st) => (
                <option key={st} value={st}>
                  {VALIDITY_LABELS[st]}
                </option>
              ))}
            </Select>
          </label>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => onSaveEdit(card.id)}>
              Guardar cambios
            </Button>
            <Button variant="secondary" size="sm" onClick={onCancelEdit}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
