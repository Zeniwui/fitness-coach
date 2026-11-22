import type { ChangeEvent } from "react";
import { AlertTriangle, ExternalLink, FileUp } from "lucide-react";
import type { components } from "../../api/generated/schema";
import { Button } from "../../ui/Button";
import { Input, Select } from "../../ui/Field";

type CandidateStudy = components["schemas"]["CandidateStudyResponse"];
type RelationType = components["schemas"]["RelationType"];
type EvidenceRelationInput = components["schemas"]["EvidenceRelationInputSchema"];
type EvidenceCardSummary =
  components["schemas"]["KnowledgeSearchResponse"]["items"][number]["card"];

const RELATION_LABELS: Record<RelationType, string> = {
  confirms: "Confirma",
  nuances: "Matiza",
  supersedes: "Supera",
};

interface CandidateStudyCardProps {
  cand: CandidateStudy;
  approvedCards: EvidenceCardSummary[];
  tagsValue: string;
  notesValue: string;
  rejectReason: string;
  relations: EvidenceRelationInput[];
  draftRelType: RelationType;
  draftRelTarget: string;
  onTagsChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onRejectReasonChange: (v: string) => void;
  onDraftRelTypeChange: (v: RelationType) => void;
  onDraftRelTargetChange: (v: string) => void;
  onAddRelation: () => void;
  onRemoveRelation: (idx: number) => void;
  onUploadPdf: (e: ChangeEvent<HTMLInputElement>) => void;
  onApprove: () => void;
  onReject: () => void;
}

export function CandidateStudyCard({
  cand,
  approvedCards,
  tagsValue,
  notesValue,
  rejectReason,
  relations,
  draftRelType,
  draftRelTarget,
  onTagsChange,
  onNotesChange,
  onRejectReasonChange,
  onDraftRelTypeChange,
  onDraftRelTargetChange,
  onAddRelation,
  onRemoveRelation,
  onUploadPdf,
  onApprove,
  onReject,
}: CandidateStudyCardProps) {
  const sheetBlocks = [
    ["1. Identificación y enlace", cand.critical_sheet.block_1_identification],
    ["2. Diseño y nivel de evidencia", cand.critical_sheet.block_2_design_and_evidence_level],
    [
      "3. Población, muestra (n) y protocolo",
      cand.critical_sheet.block_3_population_and_protocol,
    ],
    [
      "4. Hallazgos clave y aplicabilidad",
      cand.critical_sheet.block_4_key_findings_and_applicability,
    ],
    [
      "5. Limitaciones, sesgos y conflictos",
      cand.critical_sheet.block_5_limitations_and_conflicts,
    ],
    [
      "6. Impacto frente a fichas existentes",
      cand.critical_sheet.block_6_impact_vs_existing_kb,
    ],
  ] as const;

  return (
    <li className="space-y-4 rounded-panel border border-line bg-surface p-5 shadow-panel">
      {cand.paywall_warning && (
        <div className="flex items-center gap-2 rounded-control border border-warning/40 bg-warning-soft px-3.5 py-2 text-xs font-semibold text-warning-text">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{cand.paywall_warning}</span>
        </div>
      )}

      <div className="space-y-1.5">
        <h3 className="heading-section text-xl text-ink">{cand.title}</h3>
        <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
          {cand.journal && <span className="font-medium text-ink">{cand.journal}</span>}
          {cand.published_year && <span className="tabular-nums">{cand.published_year}</span>}
          {cand.doi && <span className="font-mono text-[11px]">DOI: {cand.doi}</span>}
          {cand.source_url && (
            <a
              href={cand.source_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline"
            >
              <span>Ver fuente original (DOI/PubMed)</span>
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>

      {/* 6-block critical sheet */}
      <div className="grid grid-cols-1 gap-3 rounded-panel border border-line bg-surface-muted/55 p-4 text-xs md:grid-cols-2">
        {sheetBlocks.map(([heading, content]) => (
          <div key={heading} className="space-y-1">
            <p className="font-semibold text-accent-text">{heading}</p>
            <p className="leading-relaxed text-ink-muted">{content}</p>
          </div>
        ))}
      </div>

      {cand.status === "pending" && (
        <div className="space-y-3.5 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-control border border-secondary/35 bg-secondary-soft px-3 py-1.5 text-xs font-semibold text-secondary-text hover:bg-secondary/20">
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Subir PDF completo y re-analizar</span>
              <input
                type="file"
                accept="application/pdf"
                onChange={onUploadPdf}
                className="sr-only"
              />
            </label>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Input
              compact
              type="text"
              aria-label="Etiquetas para la Ficha de Evidencia"
              value={tagsValue}
              onChange={(e) => onTagsChange(e.target.value)}
              placeholder="Etiquetas (ej.: hipertrofia, rir)"
            />
            <Input
              compact
              type="text"
              aria-label="Notas del Curador"
              value={notesValue}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Notas prácticas del Curador (opcional)"
            />
          </div>

          {approvedCards.length > 0 && (
            <div className="space-y-2.5 rounded-control border border-line bg-surface-muted/50 p-3.5">
              <p className="text-xs font-semibold text-ink">
                Relaciones de evolución con Fichas de Evidencia existentes (opcional)
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Select
                  compact
                  aria-label="Tipo de relación de evolución"
                  value={draftRelType}
                  onChange={(e) => onDraftRelTypeChange(e.target.value as RelationType)}
                  className="sm:w-36"
                >
                  <option value="confirms">Confirma</option>
                  <option value="nuances">Matiza</option>
                  <option value="supersedes">Supera</option>
                </Select>
                <Select
                  compact
                  aria-label="Ficha de Evidencia objetivo"
                  value={draftRelTarget}
                  onChange={(e) => onDraftRelTargetChange(e.target.value)}
                  className="flex-1"
                >
                  <option value="">Selecciona Ficha de Evidencia…</option>
                  {approvedCards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {card.title}
                    </option>
                  ))}
                </Select>
                <Button variant="soft" size="sm" onClick={onAddRelation}>
                  Añadir relación
                </Button>
              </div>

              {relations.length > 0 && (
                <ul className="space-y-1.5">
                  {relations.map((rel, idx) => {
                    const target = approvedCards.find((c) => c.id === rel.target_card_id);
                    return (
                      <li
                        key={`${rel.target_card_id}-${rel.relation_type}-${idx}`}
                        className="flex items-center justify-between gap-2 rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink"
                      >
                        <span>
                          <strong className="font-semibold text-accent-text">
                            {RELATION_LABELS[rel.relation_type]}
                          </strong>{" "}
                          a {target?.title ?? rel.target_card_id}
                        </span>
                        <button
                          type="button"
                          onClick={() => onRemoveRelation(idx)}
                          className="font-medium text-danger-text hover:underline"
                        >
                          Quitar
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <Button size="sm" onClick={onApprove}>
              Aprobar Ficha
            </Button>
            <Input
              compact
              type="text"
              aria-label="Motivo de rechazo"
              value={rejectReason}
              onChange={(e) => onRejectReasonChange(e.target.value)}
              placeholder="Motivo obligatorio para rechazar…"
              className="min-w-[180px] flex-1"
            />
            <Button variant="danger" size="sm" onClick={onReject}>
              Rechazar estudio
            </Button>
          </div>
        </div>
      )}

      {cand.status === "rejected" && cand.rejection_reason && (
        <p className="rounded-control bg-danger-soft px-3 py-2 text-xs text-danger-text">
          <span className="font-semibold">Motivo de rechazo:</span> {cand.rejection_reason}
        </p>
      )}
    </li>
  );
}
