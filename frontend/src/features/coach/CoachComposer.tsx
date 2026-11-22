import type { ChangeEvent, FormEvent } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { Select, Textarea } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { VoiceDictationButton } from "../multimodal/VoiceDictationButton";

export type ImageCategory = "meal" | "label_supplement" | "scale_tracker" | "general";

interface CoachComposerProps {
  inputText: string;
  onInputTextChange: (value: string) => void;
  enableLiveSearch: boolean;
  onEnableLiveSearchChange: (value: boolean) => void;
  selectedImage: File | null;
  imagePreviewUrl: string | null;
  imageCategory: ImageCategory;
  onImageCategoryChange: (cat: ImageCategory) => void;
  onImageSelect: (e: ChangeEvent<HTMLInputElement>) => void;
  onClearImage: () => void;
  onVoiceTranscript: (transcript: string) => void;
  streaming: boolean;
  onSubmit: (e: FormEvent) => void;
}

export function CoachComposer({
  inputText,
  onInputTextChange,
  enableLiveSearch,
  onEnableLiveSearchChange,
  selectedImage,
  imagePreviewUrl,
  imageCategory,
  onImageCategoryChange,
  onImageSelect,
  onClearImage,
  onVoiceTranscript,
  streaming,
  onSubmit,
}: CoachComposerProps) {
  return (
    <Surface variant="elevated" padded="sm">
      <form onSubmit={onSubmit} className="space-y-3">
        <label htmlFor="coach-message-input" className="block text-xs font-medium text-ink-muted">
          Mensaje para el Coach
        </label>
        <Textarea
          id="coach-message-input"
          rows={3}
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          placeholder="Escribe o dicta tu consulta, una Sesión de Entrenamiento o adjunta una foto…"
        />

        {selectedImage && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-accent/35 bg-accent-soft/50 p-2.5">
            <div className="flex items-center gap-2.5">
              {imagePreviewUrl && (
                <img
                  src={imagePreviewUrl}
                  alt="Vista previa de imagen adjunta"
                  className="h-11 w-11 rounded-control object-cover"
                />
              )}
              <div className="space-y-1 text-xs">
                <p className="font-medium text-ink">{selectedImage.name}</p>
                <label className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                  <span>Tipo:</span>
                  <Select
                    compact
                    value={imageCategory}
                    onChange={(e) => onImageCategoryChange(e.target.value as ImageCategory)}
                    className="w-auto"
                  >
                    <option value="meal">Comida</option>
                    <option value="label_supplement">Etiqueta / suplemento</option>
                    <option value="scale_tracker">Báscula / app</option>
                    <option value="general">General</option>
                  </Select>
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={onClearImage}
              aria-label="Quitar imagen adjunta"
              className="rounded-control p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <VoiceDictationButton onTranscript={onVoiceTranscript} disabled={streaming} />
          <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-control border border-line-strong bg-surface px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-accent hover:text-accent-text">
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Adjuntar imagen</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onImageSelect}
              disabled={streaming}
              className="sr-only"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={enableLiveSearch}
              onChange={(e) => onEnableLiveSearchChange(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong accent-accent"
            />
            <span>Búsqueda en vivo (cuarentena)</span>
          </label>
          <Button type="submit" size="md" disabled={streaming || !inputText.trim()}>
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{streaming ? "Respondiendo…" : "Enviar"}</span>
          </Button>
        </div>
      </form>
    </Surface>
  );
}
