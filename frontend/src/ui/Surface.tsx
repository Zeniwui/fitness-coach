import type { HTMLAttributes, ReactNode } from "react";

export type SurfaceVariant =
  | "default"
  | "elevated"
  | "inset"
  | "accent"
  | "warning"
  | "danger"
  | "classical";

const VARIANT_CLASSES: Record<SurfaceVariant, string> = {
  default: "border-line bg-surface shadow-panel",
  elevated: "border-line bg-surface-elevated shadow-elevated",
  inset: "border-line bg-surface-muted/70",
  accent: "border-accent/35 bg-accent-soft/60",
  warning: "border-warning/35 bg-warning-soft/75",
  danger: "border-danger/35 bg-danger-soft/75",
  classical: "surface-classical-accent border-line bg-surface shadow-panel",
};

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SurfaceVariant;
  padded?: "none" | "sm" | "md" | "lg";
  children: ReactNode;
}

const PAD_CLASSES: Record<NonNullable<SurfaceProps["padded"]>, string> = {
  none: "",
  sm: "p-3.5",
  md: "p-5",
  lg: "p-6 sm:p-7",
};

export function Surface({
  variant = "default",
  padded = "md",
  className = "",
  children,
  ...rest
}: SurfaceProps) {
  return (
    <div
      className={`rounded-panel border ${VARIANT_CLASSES[variant]} ${PAD_CLASSES[padded]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
