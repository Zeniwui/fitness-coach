import type { ButtonHTMLAttributes } from "react";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "neutral" | "danger" | "accent";
}

const TONE_CLASSES: Record<NonNullable<IconButtonProps["tone"]>, string> = {
  neutral: "text-ink-muted hover:bg-surface-muted hover:text-ink",
  danger: "text-danger-text hover:bg-danger-soft",
  accent: "text-accent-text hover:bg-accent-soft",
};

export function IconButton({
  tone = "neutral",
  type = "button",
  className = "",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-control px-2 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[36px] sm:min-w-[36px] ${TONE_CLASSES[tone]} ${className}`}
      {...rest}
    />
  );
}
