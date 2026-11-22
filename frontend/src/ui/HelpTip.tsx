import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { HelpCircle } from "lucide-react";

export interface HelpTipProps {
  term: string;
  title?: string;
  triggerLabel?: string;
  children: ReactNode;
  className?: string;
}

export function HelpTip({
  term,
  title,
  triggerLabel,
  children,
  className = "",
}: HelpTipProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className={`inline-flex max-w-full flex-col items-start ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Ayuda sobre ${term}`}
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1 rounded-control border px-2 py-1 text-xs font-medium transition-colors sm:min-h-[30px] sm:min-w-[30px] ${
          open
            ? "border-secondary/45 bg-secondary-soft text-secondary-text"
            : "border-line bg-surface-muted/60 text-ink-muted hover:border-secondary/40 hover:bg-secondary-soft/60 hover:text-secondary-text"
        }`}
      >
        <HelpCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {triggerLabel && <span>{triggerLabel}</span>}
      </button>

      {open && (
        <div
          id={panelId}
          role="note"
          className="mt-2 w-full max-w-[65ch] rounded-control border border-secondary/35 bg-secondary-soft/65 px-3 py-2 text-left text-xs leading-relaxed text-ink"
        >
          {title && <p className="font-semibold text-secondary-text">{title}</p>}
          <p className={title ? "mt-0.5 text-ink-muted" : "text-ink-muted"}>{children}</p>
        </div>
      )}
    </div>
  );
}
