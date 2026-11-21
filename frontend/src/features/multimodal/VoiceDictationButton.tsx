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
      <span className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-[11px] text-slate-400">
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
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
          isListening
            ? "border-rose-400 bg-rose-500/20 text-rose-200 animate-pulse"
            : "border-slate-700 bg-slate-900 text-slate-200 hover:border-emerald-400 hover:text-emerald-200"
        }`}
      >
        <Mic className="h-3.5 w-3.5" aria-hidden="true" />
        {isListening ? "Escuchando…" : label}
      </button>
      {interimTranscript && (
        <p className="text-[11px] italic text-emerald-300">Transcribiendo: “{interimTranscript}”</p>
      )}
      {error && (
        <p role="status" className="text-[11px] text-amber-300">
          {error}
        </p>
      )}
    </div>
  );
}
