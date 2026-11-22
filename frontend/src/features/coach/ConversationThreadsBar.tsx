import { MessageSquare } from "lucide-react";
import type { components } from "../../api/generated/schema";
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
      <p className="text-xs font-semibold text-ink-muted">Conversaciones</p>
      <div
        aria-label="Hilos de conversación"
        className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible lg:pb-0"
      >
        {conversations.map((conv) => {
          const isActive = conv.id === activeConvId;
          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => onSelect(conv.id)}
              className={`flex shrink-0 items-center gap-2 rounded-control border px-3 py-2 text-left text-xs font-medium transition-colors lg:w-full ${
                isActive
                  ? "border-accent/40 bg-accent-soft text-accent-text"
                  : "border-transparent bg-surface-muted/70 text-ink-muted hover:border-line hover:text-ink"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-75" aria-hidden="true" />
              <span className="truncate">{conv.title}</span>
            </button>
          );
        })}
      </div>
    </Surface>
  );
}
