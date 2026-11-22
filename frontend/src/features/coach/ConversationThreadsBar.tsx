import { MessageSquare } from "lucide-react";
import type { components } from "../../api/generated/schema";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";

type ConversationItem = components["schemas"]["ConversationResponse"];

interface ConversationThreadsBarProps {
  conversations: ConversationItem[];
  activeConvId: string | null;
  onSelect: (id: string) => void;
}

export function ConversationThreadsBar({
  conversations,
  activeConvId,
  onSelect,
}: ConversationThreadsBarProps) {
  if (conversations.length === 0) return null;

  return (
    <Surface variant="default" padded="sm" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-muted">Conversaciones</p>
        <span className="text-xs text-ink-subtle tabular-nums">{conversations.length}</span>
      </div>
      <div
        aria-label="Hilos de conversación"
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible lg:pb-0"
      >
        {conversations.map((conv) => {
          const isActive = conv.id === activeConvId;
          return (
            <Button
              key={conv.id}
              variant={isActive ? "soft" : "ghost"}
              size="sm"
              aria-current={isActive ? "true" : undefined}
              onClick={() => onSelect(conv.id)}
              className={`shrink-0 snap-start justify-start font-medium lg:w-full ${
                isActive ? "" : "bg-surface-muted/70 text-ink-muted hover:text-ink"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden="true" />
              <span className="truncate">{conv.title}</span>
            </Button>
          );
        })}
      </div>
    </Surface>
  );
}
