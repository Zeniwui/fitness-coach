import type { RefObject } from "react";
import { Link } from "react-router-dom";
import { ArrowDown } from "lucide-react";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import { ChatMessageCard } from "./ChatMessageCard";
import type { ChatMessageItem, CitationItem, QuarantinedLiveResultItem } from "./sse";

const STARTER_PROMPTS = [
  "¿Cuántas series semanales efectivas recomiendas para hipertrofia?",
  "Revisa mi Mesociclo actual y sugiere ajustes según mi Perfil Vivo",
  "¿Qué dosis de creatina monohidrato tiene mejor respaldo científico?",
] as const;

interface CoachMessagesViewportProps {
  containerRef: RefObject<HTMLDivElement>;
  loadingInitial: boolean;
  messages: ChatMessageItem[];
  streaming: boolean;
  streamingDraft: string;
  showJumpToBottom: boolean;
  promotedUrls: Record<string, boolean>;
  promotingUrl: string | null;
  onScroll: () => void;
  onJumpToBottom: () => void;
  onPickStarterPrompt: (prompt: string) => void;
  onSelectCitation: (citation: CitationItem) => void;
  onPromoteLiveHit: (hit: QuarantinedLiveResultItem) => void;
}

export function CoachMessagesViewport({
  containerRef,
  loadingInitial,
  messages,
  streaming,
  streamingDraft,
  showJumpToBottom,
  promotedUrls,
  promotingUrl,
  onScroll,
  onJumpToBottom,
  onPickStarterPrompt,
  onSelectCitation,
  onPromoteLiveHit,
}: CoachMessagesViewportProps) {
  return (
    <>
      <div
        ref={containerRef}
        onScroll={onScroll}
        role="region"
        aria-label="Mensajes de la conversación"
        className="max-h-[64vh] space-y-3.5 overflow-y-auto pr-1"
      >
        {loadingInitial ? (
          <p role="status" className="text-sm text-ink-muted">
            Cargando conversaciones del Coach…
          </p>
        ) : (
          messages.length === 0 &&
          !streaming && (
            <Surface variant="inset" padded="md" className="space-y-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">
                  Empieza una consulta con tu Coach
                </p>
                <p className="text-xs leading-relaxed text-ink-muted">
                  El Coach cruza tu{" "}
                  <Link to="/profile" className="font-medium text-accent-text underline">
                    Perfil Vivo
                  </Link>
                  , tu{" "}
                  <Link to="/training" className="font-medium text-accent-text underline">
                    Mesociclo
                  </Link>{" "}
                  y tu{" "}
                  <Link to="/nutrition" className="font-medium text-accent-text underline">
                    Fase Nutricional
                  </Link>{" "}
                  con la Base de Conocimiento aprobada.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {STARTER_PROMPTS.map((prompt) => (
                  <Button
                    key={prompt}
                    variant="secondary"
                    size="sm"
                    onClick={() => onPickStarterPrompt(prompt)}
                    className="text-left font-normal"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </Surface>
          )
        )}

        {messages.map((msg) => (
          <ChatMessageCard
            key={msg.id}
            msg={msg}
            promotedUrls={promotedUrls}
            promotingUrl={promotingUrl}
            onSelectCitation={onSelectCitation}
            onPromoteLiveHit={onPromoteLiveHit}
          />
        ))}

        {streaming && (
          <article
            aria-live="polite"
            aria-busy="true"
            className="mr-2 space-y-2 rounded-panel border border-accent/40 bg-surface p-4 shadow-panel sm:mr-6"
          >
            <p className="text-xs font-semibold text-accent-text">Coach escribiendo…</p>
            <p className="max-w-[70ch] whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {streamingDraft || "Analizando tu Perfil Vivo y la Base de Conocimiento…"}
            </p>
          </article>
        )}
      </div>

      {showJumpToBottom && (messages.length > 0 || streaming) && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onJumpToBottom}>
            <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ir al último mensaje</span>
          </Button>
        </div>
      )}
    </>
  );
}
