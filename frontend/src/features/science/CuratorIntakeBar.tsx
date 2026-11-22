import type { ChangeEvent, FormEvent } from "react";
import { FileUp, RefreshCw } from "lucide-react";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { FileUploadButton } from "../../ui/FileUploadButton";
import { Surface } from "../../ui/Surface";

export interface PriorRejectionConflict {
  doiOrUrl: string;
  priorTitle: string;
  priorReason: string;
}

interface CuratorIntakeBarProps {
  doiInput: string;
  priorRejection: PriorRejectionConflict | null;
  onDoiInputChange: (v: string) => void;
  onDoiSubmit: (e: FormEvent) => void;
  onReopenPriorRejection: (doiOrUrl: string) => void;
  onProposeFromPdf: (e: ChangeEvent<HTMLInputElement>) => void;
  onReindex: () => void;
}

export function CuratorIntakeBar({
  doiInput,
  priorRejection,
  onDoiInputChange,
  onDoiSubmit,
  onReopenPriorRejection,
  onProposeFromPdf,
  onReindex,
}: CuratorIntakeBarProps) {
  return (
    <Surface variant="focal" padded="md" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="heading-section text-xl text-ink">Bandeja del Curador</h2>
          <p className="max-w-2xl text-xs leading-relaxed text-ink-muted">
            Propón Estudios Candidatos por DOI o PDF, audita la ficha crítica de 6 bloques y
            aprueba o rechaza antes de indexar.
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={onReindex}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Re-indexar Base</span>
        </Button>
      </div>

      <form onSubmit={onDoiSubmit} className="flex flex-col gap-2.5 sm:flex-row">
        <label htmlFor="curator-doi-input" className="sr-only">
          DOI o enlace del estudio
        </label>
        <Input
          id="curator-doi-input"
          aria-label="DOI o enlace del estudio"
          type="text"
          value={doiInput}
          onChange={(e) => onDoiInputChange(e.target.value)}
          placeholder="Ej.: 10.1007/s40279-023-01880-x o https://doi.org/..."
          className="flex-1"
        />
        <Button type="submit" size="md">
          Proponer por DOI
        </Button>
        <FileUploadButton
          accept="application/pdf"
          tone="secondary"
          ariaLabel="Proponer nuevo estudio desde PDF"
          onChange={onProposeFromPdf}
        >
          <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Proponer nuevo estudio desde PDF</span>
        </FileUploadButton>
      </form>

      {priorRejection && (
        <AlertBanner tone="warning" className="space-y-2 text-xs">
          <p className="font-semibold">
            Estudio rechazado anteriormente: {priorRejection.priorTitle}
          </p>
          <p>Motivo previo: {priorRejection.priorReason}</p>
          <Button
            variant="warning"
            size="sm"
            onClick={() => onReopenPriorRejection(priorRejection.doiOrUrl)}
          >
            Reabrir estudio
          </Button>
        </AlertBanner>
      )}
    </Surface>
  );
}
