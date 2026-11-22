import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import type { ConflictModalState } from "./types";

interface MesocycleConflictModalProps {
  modal: ConflictModalState;
  onResolve: (transition: "completed" | "archived") => void;
  onCancel: () => void;
}

export function MesocycleConflictModal({
  modal,
  onResolve,
  onCancel,
}: MesocycleConflictModalProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirmar cambio de Mesociclo activo"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm"
    >
      <Surface variant="elevated" padded="lg" className="w-full max-w-md space-y-4">
        <h2 className="heading-section text-xl text-ink">
          Confirmar cambio de Mesociclo activo
        </h2>
        <p className="text-sm leading-relaxed text-ink-muted">
          Actualmente tienes activo{" "}
          <strong className="font-semibold text-ink">{modal.activeMesocycleName}</strong>. Para
          activar{" "}
          <strong className="font-semibold text-ink">{modal.targetMesocycleName}</strong>, elige
          qué hacer con el Mesociclo anterior:
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <Button fullWidth onClick={() => onResolve("completed")}>
            Completar anterior y activar
          </Button>
          <Button variant="secondary" fullWidth onClick={() => onResolve("archived")}>
            Archivar anterior y activar
          </Button>
          <Button variant="ghost" fullWidth onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </Surface>
    </div>
  );
}
