import { BookOpen, ExternalLink, Paperclip, ShieldAlert } from "lucide-react";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import type { ChatMessageItem, CitationItem, QuarantinedLiveResultItem } from "./sse";

export const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  meta_analysis: "Meta-análisis",
  systematic_review: "Revisión sistemática",
  position_stand: "Posicionamiento (ISSN)",
  rct: "Ensayo clínico (RCT)",
  controlled_trial: "Ensayo controlado",
  observational: "Observacional",
  mechanistic: "Mecanístico",
  preprint: "Preprint",
};

export const VALIDITY_LABELS: Record<string, string> = {
  active: "Vigente",
  nuanced: "Matizada",
  superseded: "Superada",
  archived: "Archivada",
};

interface ChatMessageCardProps {
  msg: ChatMessageItem;
  promotedUrls: Record<string, boolean>;
  promotingUrl: string | null;
  onSelectCitation: (citation: CitationItem) => void;
  onPromoteLiveHit: (hit: QuarantinedLiveResultItem) => void;
}

export function ChatMessageCard({
  msg,
  promotedUrls,
  promotingUrl,
  onSelectCitation,
  onPromoteLiveHit,
}: ChatMessageCardProps) {
  const isUser = msg.role === "user";

  return (
    <article
      className={`space-y-3 rounded-panel border p-4 sm:p-5 ${
        isUser
          ? "ml-6 border-accent/30 bg-accent-soft/65 text-ink sm:ml-14"
          : "mr-2 border-line bg-surface text-ink shadow-panel sm:mr-6"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-xs font-semibold ${
            isUser ? "text-accent-text" : "text-secondary-text"
          }`}
        >
          {isUser ? "Atleta" : "Coach"}
        </span>
      </div>

      <p className="max-w-[72ch] whitespace-pre-wrap text-sm leading-relaxed text-ink">
        {msg.content}
      </p>

      {msg.attachments && msg.attachments.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {msg.attachments.map((att) => (
            <Badge key={att.id} tone="accent">
              <Paperclip className="h-3 w-3" aria-hidden="true" />
              Imagen adjunta: {att.original_filename ?? "imagen"}
            </Badge>
          ))}
        </div>
      )}

      {!isUser && msg.used_general_knowledge && (
        <p className="inline-block rounded-control border border-secondary/35 bg-secondary-soft px-2.5 py-1 text-xs text-secondary-text">
          Respuesta basada en conocimiento general (sin Ficha de Evidencia aprobada).
        </p>
      )}

      {!isUser && msg.citations && msg.citations.length > 0 && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-accent-text">
            <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
            Fichas de Evidencia citadas:
          </p>
          <div className="flex flex-wrap gap-2">
            {msg.citations.map((cit) => (
              <button
                key={cit.card_id}
                type="button"
                onClick={() => onSelectCitation(cit)}
                className="rounded-control border border-accent/30 bg-accent-soft/60 px-3 py-1.5 text-left text-xs text-ink transition-colors hover:border-accent hover:bg-accent-soft"
              >
                <span className="font-semibold text-ink">{cit.title}</span>{" "}
                <span className="text-[11px] text-accent-text">
                  [{EVIDENCE_LEVEL_LABELS[cit.evidence_level] ?? cit.evidence_level} ·{" "}
                  {VALIDITY_LABELS[cit.validity_status] ?? cit.validity_status}]
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {!isUser && msg.live_search_results && msg.live_search_results.length > 0 && (
        <div className="space-y-2.5 rounded-panel border border-warning/40 bg-warning-soft/75 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-warning-text">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            Cuarentena: fuente externa aún no verificada en Base de Conocimiento
          </p>
          {msg.live_search_results.map((hit) => {
            const isPromoted = Boolean(promotedUrls[hit.url]);
            return (
              <div
                key={hit.url}
                className="space-y-2 rounded-control border border-warning/30 bg-surface p-3"
              >
                <p className="text-xs font-semibold text-ink">{hit.title}</p>
                <p className="text-xs leading-relaxed text-ink-muted">{hit.snippet}</p>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <a
                    href={hit.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-warning-text underline underline-offset-2"
                  >
                    <span>Ver fuente externa</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                  {isPromoted ? (
                    <Badge tone="success">Enviado como Estudio Candidato pendiente</Badge>
                  ) : (
                    <Button
                      variant="warning"
                      size="sm"
                      disabled={promotingUrl === hit.url}
                      onClick={() => onPromoteLiveHit(hit)}
                    >
                      Enviar a Estudios Candidatos
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}
