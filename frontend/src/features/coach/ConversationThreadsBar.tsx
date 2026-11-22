import { useState, type FormEvent } from "react";
import { Check, MessageSquare, Pencil, X } from "lucide-react";
import type { components } from "../../api/generated/schema";
import { Button } from "../../ui/Button";
import { ConfirmActionButton } from "../../ui/ConfirmActionButton";
import { Input } from "../../ui/Field";
import { IconButton } from "../../ui/IconButton";
import { Surface } from "../../ui/Surface";

type ConversationItem = components["schemas"]["ConversationResponse"];

interface ConversationThreadsBarProps {
  conversations: ConversationItem[];
  activeConvId: string | null;
  busy?: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}

export function ConversationThreadsBar({
  conversations,
  activeConvId,
  busy = false,
  onSelect,
  onRename,
  onDelete,
}: ConversationThreadsBarProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  if (conversations.length === 0) return null;

  function startEditing(conv: ConversationItem) {
    setEditingId(conv.id);
    setDraftTitle(conv.title);
    setValidationError(null);
  }

  function cancelEditing() {
    setEditingId(null);
    setDraftTitle("");
    setValidationError(null);
  }

  async function handleRenameSubmit(event: FormEvent, convId: string) {
    event.preventDefault();
    const trimmed = draftTitle.trim();
    if (!trimmed) {
      setValidationError("El título no puede estar vacío.");
      return;
    }
    setSavingId(convId);
    setValidationError(null);
    try {
      const ok = await onRename(convId, trimmed);
      if (ok) {
        cancelEditing();
      }
    } finally {
      setSavingId(null);
    }
  }

  return (
    <Surface variant="default" padded="sm" className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-ink-muted">Conversaciones</p>
        <span className="text-xs text-ink-subtle tabular-nums">{conversations.length}</span>
      </div>

      <ul
        aria-label="Hilos de conversación"
        className="flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-x-visible lg:pb-0"
      >
        {conversations.map((conv) => {
          const isActive = conv.id === activeConvId;
          const isEditing = editingId === conv.id;
          const isSaving = savingId === conv.id;

          return (
            <li
              key={conv.id}
              className="min-w-[15rem] shrink-0 snap-start rounded-control border border-line bg-surface-muted/45 p-1.5 lg:min-w-0 lg:w-full"
            >
              {isEditing ? (
                <form
                  onSubmit={(e) => void handleRenameSubmit(e, conv.id)}
                  className="space-y-1.5 p-1"
                >
                  <Input
                    compact
                    type="text"
                    aria-label="Nuevo título de conversación"
                    value={draftTitle}
                    onChange={(e) => {
                      setDraftTitle(e.target.value);
                      if (validationError) setValidationError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditing();
                      }
                    }}
                    maxLength={200}
                    disabled={isSaving}
                    autoFocus
                  />
                  {validationError && (
                    <p role="alert" className="text-xs text-danger-text">
                      {validationError}
                    </p>
                  )}
                  <div className="flex items-center gap-1.5">
                    <Button type="submit" size="sm" disabled={isSaving || busy}>
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Guardar título</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isSaving}
                      onClick={cancelEditing}
                    >
                      <X className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Cancelar</span>
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="space-y-1">
                  <div className="flex items-center gap-1">
                    <Button
                      variant={isActive ? "soft" : "ghost"}
                      size="sm"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => onSelect(conv.id)}
                      className={`min-w-0 flex-1 justify-start font-medium ${
                        isActive ? "" : "text-ink-muted hover:text-ink"
                      }`}
                    >
                      <MessageSquare
                        className="h-3.5 w-3.5 shrink-0 opacity-75"
                        aria-hidden="true"
                      />
                      <span className="truncate">{conv.title}</span>
                    </Button>
                    <IconButton
                      tone="neutral"
                      disabled={busy}
                      aria-label={`Renombrar conversación ${conv.title}`}
                      title="Renombrar conversación"
                      onClick={() => startEditing(conv)}
                      className="shrink-0"
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </IconButton>
                  </div>

                  <div className="flex justify-end px-1">
                    <ConfirmActionButton
                      label="Eliminar"
                      ariaLabel={`Eliminar conversación ${conv.title}`}
                      confirmLabel="Confirmar eliminación"
                      variant="ghost"
                      confirmVariant="danger"
                      size="sm"
                      disabled={busy}
                      onConfirm={() => onDelete(conv.id)}
                    />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Surface>
  );
}
