import type { ChangeEvent, FormEvent, KeyboardEvent } from "react";
import { ImagePlus, Send, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { Select, Textarea } from "../../ui/Field";
import { FileUploadButton } from "../../ui/FileUploadButton";
import { IconButton } from "../../ui/IconButton";
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
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!streaming && inputText.trim()) {
        event.currentTarget.form?.requestSubmit();
      }
    }
  }

  return (
    <Surface variant="elevated" padded="sm">
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="coach-message-input" className="block text-xs font-medium text-ink-muted">
            Mensaje para el Coach
          </label>
          <span className="hidden text-xs text-ink-subtle sm:inline">Ctrl/⌘ + Enter para enviar</span>
        </div>
        <Textarea
          id="coach-message-input"
          rows={3}
          value={inputText}
          onChange={(e) => onInputTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Escribe o dicta tu consulta, una Sesión de Entrenamiento o adjunta una foto…"
        />

        {selectedImage && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-accent/35 bg-accent-soft/50 p-2.5">
            <div className="flex items-center gap-2.5">
              {imagePreviewUrl && (
                <img
                  src={imagePreviewUrl}
                  alt="Vista previa de imagen adjunta"
                  width={44}
                  height={44}
                  className="h-11 w-11 rounded-control object-cover"
                />
              )}
              <div className="space-y-1 text-xs">
                <p className="font-medium text-ink">{selectedImage.name}</p>
                <label className="flex items-center gap-1.5 text-xs text-ink-muted">
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
            <IconButton onClick={onClearImage} aria-label="Quitar imagen adjunta">
              <X className="h-4 w-4" aria-hidden="true" />
            </IconButton>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <VoiceDictationButton onTranscript={onVoiceTranscript} disabled={streaming} />
          <FileUploadButton
            accept="image/jpeg,image/png,image/webp"
            onChange={onImageSelect}
            disabled={streaming}
          >
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Adjuntar imagen</span>
          </FileUploadButton>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-xs text-ink-muted sm:min-h-[32px]">
            <input
              type="checkbox"
              checked={enableLiveSearch}
              onChange={(e) => onEnableLiveSearchChange(e.target.checked)}
              className="h-4 w-4 shrink-0 rounded border-line-strong accent-accent"
            />
            <span>
              <span className="font-medium text-ink">Búsqueda en vivo</span>{" "}
              <span className="text-ink-subtle">(fuentes externas sin revisar por el Curador)</span>
            </span>
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
