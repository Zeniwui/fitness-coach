import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike {
  resultIndex?: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionInstanceLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstanceLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") {
    return null;
  }
  const win = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition ?? null;
}

export interface UseVoiceDictationOptions {
  lang?: string;
  onTranscript: (text: string) => void;
}

export interface UseVoiceDictationResult {
  isSupported: boolean;
  isListening: boolean;
  interimTranscript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  toggleListening: () => void;
}

export function useVoiceDictation({
  lang = "es-ES",
  onTranscript,
}: UseVoiceDictationOptions): UseVoiceDictationResult {
  const [isSupported] = useState<boolean>(() => getSpeechRecognitionCtor() !== null);
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionInstanceLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore stop errors when already inactive
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError(
        "El dictado por voz no está disponible en este navegador. Puedes escribir directamente.",
      );
      return;
    }

    setError(null);
    setInterimTranscript("");

    try {
      const recognition = new Ctor();
      recognition.lang = lang;
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onresult = (event) => {
        let finalChunk = "";
        let interimChunk = "";
        const startIdx = event.resultIndex ?? 0;
        for (let i = startIdx; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result?.[0]?.transcript ?? "";
          if (result?.isFinal) {
            finalChunk += text;
          } else {
            interimChunk += text;
          }
        }
        setInterimTranscript(interimChunk.trim());
        if (finalChunk.trim()) {
          onTranscriptRef.current(finalChunk.trim());
        }
      };

      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setError(
            "Permiso de micrófono denegado. Habilita el micrófono o escribe tu mensaje manualmente.",
          );
        } else if (event.error === "no-speech") {
          setError("No se detectó voz. Inténtalo de nuevo más cerca del micrófono.");
        } else {
          setError("No se pudo completar el dictado por voz. Puedes escribirlo manualmente.");
        }
        setIsListening(false);
        setInterimTranscript("");
      };

      recognition.onend = () => {
        setIsListening(false);
        setInterimTranscript("");
        recognitionRef.current = null;
      };

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch {
      setIsListening(false);
      setError("No se pudo iniciar el micrófono. Escribe tu mensaje manualmente.");
    }
  }, [lang]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore cleanup error
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    interimTranscript,
    error,
    startListening,
    stopListening,
    toggleListening,
  };
}
