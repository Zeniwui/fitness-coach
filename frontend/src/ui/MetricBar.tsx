interface MetricBarProps {
  value: number;
  max: number;
  tone?: "accent" | "secondary" | "warning" | "success";
  ariaLabel?: string;
  ariaDescribedBy?: string;
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
  ariaDescribedBy,
}: MetricBarProps) {
  const safeMax = max > 0 ? max : 1;
  const ratio = Math.max(0, Math.min(1, value / safeMax));

  return (
    <div
      role={ariaLabel ? "progressbar" : undefined}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      aria-valuenow={ariaLabel ? value : undefined}
      aria-valuemin={ariaLabel ? 0 : undefined}
      aria-valuemax={ariaLabel ? safeMax : undefined}
      className="h-2 w-full overflow-hidden rounded-full bg-surface-muted"
    >
      <div
        className={`h-full w-full origin-left rounded-full transition-transform duration-300 ${FILL_CLASSES[tone]}`}
        style={{ transform: `scaleX(${ratio})` }}
      />
    </div>
  );
}
