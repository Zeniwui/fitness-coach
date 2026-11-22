import { useEffect, useRef, type ReactNode } from "react";

interface ModalDialogProps {
  onClose: () => void;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  placement?: "center" | "bottom-sheet";
  className?: string;
  children: ReactNode;
}

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function ModalDialog({
  onClose,
  ariaLabel,
  ariaLabelledBy,
  placement = "center",
  className = "",
  children,
}: ModalDialogProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const container = containerRef.current;

    const getFocusables = () =>
      Array.from(container?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR) ?? []);

    const initialFocusables = getFocusables();
    if (initialFocusables[0]) {
      initialFocusables[0].focus();
    } else {
      container?.focus();
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key === "Tab") {
        const focusables = getFocusables();
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus();
    };
  }, []);

  const overlayPlacement =
    placement === "bottom-sheet"
      ? "items-end p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      : "items-center px-4";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onCloseRef.current();
        }
      }}
      className={`fixed inset-0 z-50 flex justify-center bg-scrim/65 backdrop-blur-sm ${overlayPlacement} ${className}`}
    >
      <div
        ref={containerRef}
        tabIndex={-1}
        className={
          placement === "bottom-sheet"
            ? "max-h-[85vh] w-full max-w-lg overflow-y-auto focus:outline-none"
            : "max-h-[90vh] w-full max-w-md overflow-y-auto focus:outline-none"
        }
      >
        {children}
      </div>
    </div>
  );
}
