import type { ChangeEvent, ReactNode } from "react";

interface FileUploadButtonProps {
  accept: string;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  tone?: "neutral" | "secondary";
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
}

const TONE_CLASSES: Record<NonNullable<FileUploadButtonProps["tone"]>, string> = {
  neutral:
    "border-line-strong bg-surface text-ink hover:border-accent hover:text-accent-text",
  secondary:
    "border-secondary/35 bg-secondary-soft text-secondary-text hover:bg-secondary/20",
};

export function FileUploadButton({
  accept,
  onChange,
  disabled = false,
  tone = "neutral",
  ariaLabel,
  children,
  className = "",
}: FileUploadButtonProps) {
  return (
    <label
      className={`inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-control border px-3.5 py-2 text-xs font-semibold transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent sm:min-h-[38px] ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      } ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
      <input
        type="file"
        accept={accept}
        aria-label={ariaLabel}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
    </label>
  );
}
