import type { ButtonHTMLAttributes } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "warning" | "danger" | "soft";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-accent-ink hover:bg-accent-hover border border-transparent shadow-sm",
  secondary:
    "bg-surface text-ink border border-line-strong hover:border-ink/40 hover:bg-surface-muted/60",
  soft: "bg-accent-soft text-accent-text border border-accent/25 hover:bg-accent/15",
  ghost: "bg-transparent text-ink-muted border border-transparent hover:bg-surface-muted hover:text-ink",
  warning:
    "bg-warning text-white border border-transparent hover:opacity-90",
  danger:
    "bg-danger-soft text-danger-text border border-danger/35 hover:bg-danger/15",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[34px] px-3 py-1.5 text-xs",
  md: "min-h-[40px] px-4 py-2 text-sm",
  lg: "min-h-[44px] px-5 py-2.5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = false,
  type = "button",
  className = "",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-control font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${fullWidth ? "w-full" : ""} ${className}`}
      {...rest}
    />
  );
}
