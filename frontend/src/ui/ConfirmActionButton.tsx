import { useState } from "react";
import { Button, type ButtonSize, type ButtonVariant } from "./Button";

interface ConfirmActionButtonProps {
  label: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ButtonVariant;
  confirmVariant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmActionButton({
  label,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  variant = "danger",
  confirmVariant = "danger",
  size = "sm",
  disabled = false,
  onConfirm,
}: ConfirmActionButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        variant={variant}
        size={size}
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {label}
      </Button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <Button
        variant={confirmVariant}
        size={size}
        disabled={disabled}
        onClick={() => {
          setConfirming(false);
          void onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button
        variant="secondary"
        size={size}
        disabled={disabled}
        onClick={() => setConfirming(false)}
      >
        {cancelLabel}
      </Button>
    </span>
  );
}
