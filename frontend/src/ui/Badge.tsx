import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "accent" | "secondary" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-muted text-ink-muted",
  accent: "border-accent/30 bg-accent-soft text-accent-text",
  secondary: "border-secondary/30 bg-secondary-soft text-secondary-text",
  success: "border-success/30 bg-success-soft text-success-text",
  warning: "border-warning/35 bg-warning-soft text-warning-text",
  danger: "border-danger/35 bg-danger-soft text-danger-text",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  children: ReactNode;
}

export function Badge({ tone = "neutral", className = "", children, ...rest }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
      {...rest}
    >
      {children}
    </span>
  );
}
