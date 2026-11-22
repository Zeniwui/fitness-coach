import { Button } from "../../ui/Button";
import { ModalDialog } from "../../ui/ModalDialog";
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
    <ModalDialog ariaLabelledBy="meso-conflict-title" onClose={onCancel}>
      <Surface variant="elevated" padded="lg" className="space-y-4">
        <h2 id="meso-conflict-title" className="heading-section text-xl text-ink">
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
    </ModalDialog>
  );
}
