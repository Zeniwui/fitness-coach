import { FormEvent, useState } from "react";
import { ChevronDown, ChevronUp, Mic } from "lucide-react";
import { apiClient } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { Textarea } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { SessionDraftCard, TrainingSessionDraftItem } from "./SessionDraftCard";
import { VoiceDictationButton } from "./VoiceDictationButton";

interface NaturalSessionLoggerProps {
  activeMesocycleId?: string | null;
  defaultCollapsed?: boolean;
  onSessionSaved: () => void | Promise<void>;
}

export function NaturalSessionLogger({
  activeMesocycleId = null,
  defaultCollapsed = false,
  onSessionSaved,
}: NaturalSessionLoggerProps) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [text, setText] = useState("");
  const [origin, setOrigin] = useState<"chat_text" | "chat_voice">("chat_text");
  const [parsing, setParsing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [draft, setDraft] = useState<TrainingSessionDraftItem | null>(null);

  function handleVoiceTranscript(transcript: string) {
    setOrigin("chat_voice");
    setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
  }

  async function handleGenerateDraft(e: FormEvent) {
    e.preventDefault();
    const cleaned = text.trim();
    if (!cleaned || parsing) return;

    setParsing(true);
    setErrorMsg(null);
    setSavedNotice(null);
    try {
      const res = await apiClient.POST("/api/v1/training/sessions/parse-natural", {
        body: {
          text: cleaned,
          origin,
          session_date: new Date().toISOString().slice(0, 10),
        },
      });
      if (res.data) {
        setDraft(res.data);
      } else {
        setErrorMsg("No se pudo generar el borrador. Revisa la descripción e inténtalo de nuevo.");
      }
    } finally {
      setParsing(false);
    }
  }

  async function handleDraftSaved() {
    setDraft(null);
    setText("");
    setOrigin("chat_text");
    setSavedNotice("Sesión de Entrenamiento confirmada y guardada en tu historial.");
    await onSessionSaved();
  }

  return (
    <Surface variant="default" padded="md" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <h2 className="heading-section flex items-center gap-2 text-lg text-ink">
            <Mic className="h-4 w-4 text-accent-text" aria-hidden="true" />
            <span>Registro por voz o lenguaje natural</span>
          </h2>
          <p className="text-xs leading-relaxed text-ink-muted">
            Dicta o escribe tu Sesión de Entrenamiento (ej. “press inclinado mancuernas 3x8 con 32
            kg a RIR 1”) para revisar el borrador antes de guardarlo.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((prev) => !prev)}
        >
          <span>{expanded ? "Ocultar" : "Abrir dictado"}</span>
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {expanded && (
        <>
          {savedNotice && <AlertBanner tone="success">{savedNotice}</AlertBanner>}
          {errorMsg && <AlertBanner tone="error">{errorMsg}</AlertBanner>}

          <form onSubmit={(e) => void handleGenerateDraft(e)} className="space-y-3">
            <label
              htmlFor="nl-session-input"
              className="block text-xs font-medium text-ink-muted"
            >
              Describe tu Sesión de Entrenamiento
            </label>
            <Textarea
              id="nl-session-input"
              rows={2}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Ej. Hice 4 series de press banca con 80 kg a 8 repes RIR 2…"
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <VoiceDictationButton
                onTranscript={handleVoiceTranscript}
                disabled={parsing}
                label="Dictar sesión por voz"
              />
              <Button type="submit" size="sm" disabled={parsing || !text.trim()}>
                {parsing ? "Analizando…" : "Generar borrador"}
              </Button>
            </div>
          </form>

          {draft && (
            <SessionDraftCard
              draft={draft}
              activeMesocycleId={activeMesocycleId}
              onSaved={handleDraftSaved}
              onDiscard={() => setDraft(null)}
            />
          )}
        </>
      )}
    </Surface>
  );
}
