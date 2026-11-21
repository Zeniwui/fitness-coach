import { FormEvent, useState } from "react";
import { apiClient } from "../../api/client";
import { SessionDraftCard, TrainingSessionDraftItem } from "./SessionDraftCard";
import { VoiceDictationButton } from "./VoiceDictationButton";

interface NaturalSessionLoggerProps {
  activeMesocycleId?: string | null;
  onSessionSaved: () => void | Promise<void>;
}

export function NaturalSessionLogger({
  activeMesocycleId = null,
  onSessionSaved,
}: NaturalSessionLoggerProps) {
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
    <div className="space-y-3 rounded-2xl border border-emerald-500/30 bg-slate-900/80 p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-bold text-white">
          Registro por voz o lenguaje natural
        </h2>
        <p className="text-xs text-slate-400">
          Dicta o escribe tu Sesión de Entrenamiento (ej. “press inclinado mancuernas 3x8 con 32 kg
          a RIR 1”) para revisar el borrador antes de guardarlo.
        </p>
      </div>

      {savedNotice && (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-200"
        >
          {savedNotice}
        </p>
      )}

      {errorMsg && (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
        >
          {errorMsg}
        </p>
      )}

      <form onSubmit={(e) => void handleGenerateDraft(e)} className="space-y-2">
        <label htmlFor="nl-session-input" className="block text-xs font-medium text-slate-300">
          Describe tu Sesión de Entrenamiento
        </label>
        <textarea
          id="nl-session-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ej. Hice 4 series de press banca con 80 kg a 8 repes RIR 2…"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <VoiceDictationButton
            onTranscript={handleVoiceTranscript}
            disabled={parsing}
            label="Dictar sesión por voz"
          />
          <button
            type="submit"
            disabled={parsing || !text.trim()}
            className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {parsing ? "Analizando…" : "Generar borrador"}
          </button>
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
    </div>
  );
}
