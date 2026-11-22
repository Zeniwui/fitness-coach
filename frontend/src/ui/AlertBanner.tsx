import type { ReactNode } from "react";

interface AlertBannerProps {
  tone: "error" | "success" | "warning" | "info";
  children: ReactNode;
  className?: string;
}

const TONE_MAP: Record<AlertBannerProps["tone"], { role: "alert" | "status"; cls: string }> = {
  error: {
    role: "alert",
    cls: "border-danger/35 bg-danger-soft text-danger-text",
  },
  success: {
    role: "status",
    cls: "border-success/35 bg-success-soft text-success-text",
  },
  warning: {
    role: "status",
    cls: "border-warning/35 bg-warning-soft text-warning-text",
  },
  info: {
    role: "status",
    cls: "border-secondary/35 bg-secondary-soft text-secondary-text",
  },
};

export function AlertBanner({ tone, children, className = "" }: AlertBannerProps) {
  const { role, cls } = TONE_MAP[tone];
  return (
    <div
      role={role}
      className={`rounded-panel border px-4 py-3 text-sm leading-relaxed ${cls} ${className}`}
    >
      {children}
    </div>
  );
}
