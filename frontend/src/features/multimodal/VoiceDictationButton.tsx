import { Mic, MicOff } from "lucide-react";
import { Button } from "../../ui/Button";
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
      <span className="inline-flex min-h-[36px] items-center gap-1.5 rounded-control border border-line bg-surface-muted px-2.5 py-1.5 text-xs text-ink-muted">
        <MicOff className="h-3.5 w-3.5" aria-hidden="true" />
        Dictado por voz no disponible en este navegador
      </span>
    );
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button
        variant={isListening ? "danger" : "secondary"}
        size="sm"
        onClick={toggleListening}
        disabled={disabled}
        aria-pressed={isListening}
        aria-label={isListening ? "Detener dictado por voz" : label}
      >
        {isListening && (
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full bg-danger motion-safe:animate-pulse"
          />
        )}
        <Mic className="h-3.5 w-3.5" aria-hidden="true" />
        <span>{isListening ? "Escuchando…" : label}</span>
      </Button>
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
