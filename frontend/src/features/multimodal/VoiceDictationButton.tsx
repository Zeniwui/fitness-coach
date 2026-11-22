import { Mic, MicOff } from "lucide-react";
import { useVoiceDictation } from "./useVoiceDictation";

interface VoiceDictationButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  label?: string;
}

export function VoiceDictationButton({
  onTranscript,
  disabled = false,
  label = "Dictar por voz",
}: VoiceDictationButtonProps) {
  const { isSupported, isListening, interimTranscript, error, toggleListening } =
    useVoiceDictation({ onTranscript });

  if (!isSupported) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-control border border-line bg-surface-muted px-2.5 py-1.5 text-xs text-ink-muted">
        <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
        Dictado por voz no disponible en este navegador
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggleListening}
        disabled={disabled}
        aria-pressed={isListening}
        aria-label={isListening ? "Detener dictado por voz" : label}
        className={`inline-flex min-h-[34px] items-center gap-1.5 rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
          isListening
            ? "animate-pulse border-danger bg-danger-soft text-danger-text"
            : "border-line-strong bg-surface text-ink hover:border-accent hover:text-accent-text"
        }`}
      >
        <Mic className="h-3.5 w-3.5" aria-hidden="true" />
        {isListening ? "Escuchando…" : label}
      </button>
      {interimTranscript && (
        <p className="text-xs italic text-accent-text">Transcribiendo: “{interimTranscript}”</p>
      )}
      {error && (
        <p role="status" className="text-xs text-warning-text">
          {error}
        </p>
      )}
    </div>
  );
}
