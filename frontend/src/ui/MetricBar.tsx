interface MetricBarProps {
  value: number;
  max: number;
  tone?: "accent" | "secondary" | "warning" | "success";
  ariaLabel?: string;
}

const FILL_CLASSES: Record<NonNullable<MetricBarProps["tone"]>, string> = {
  accent: "bg-accent",
  secondary: "bg-secondary",
  warning: "bg-warning",
  success: "bg-success",
};

export function MetricBar({
  value,
  max,
  tone = "accent",
  ariaLabel,
}: MetricBarProps) {
  const safeMax = max > 0 ? max : 1;
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));

  return (
    <div
      role={ariaLabel ? "progressbar" : undefined}
      aria-label={ariaLabel}
      aria-valuenow={ariaLabel ? value : undefined}
      aria-valuemin={ariaLabel ? 0 : undefined}
      aria-valuemax={ariaLabel ? safeMax : undefined}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className={`h-full rounded-full transition-all duration-300 ${FILL_CLASSES[tone]}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
