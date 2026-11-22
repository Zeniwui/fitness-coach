import { scaleYValue, type ChartDimensions, type ChartDomain } from "./chartMath";

export interface ChartSummaryItem {
  label: string;
  value: string;
  tone?: "default" | "accent" | "secondary" | "success" | "warning";
}

export const SUMMARY_TONE_CLASS: Record<NonNullable<ChartSummaryItem["tone"]>, string> = {
  default: "text-ink",
  accent: "text-accent-text",
  secondary: "text-secondary-text",
  success: "text-success-text",
  warning: "text-warning-text",
};

export function defaultFormatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function ChartEmptyState({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="rounded-control border border-line bg-surface-muted/50 px-4 py-3.5 text-sm leading-relaxed text-ink-muted"
    >
      {message}
    </div>
  );
}

export function ChartSummaryStrip({ items }: { items?: ChartSummaryItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 border-b border-line pb-3 text-xs">
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-ink-muted">{item.label}</dt>
          <dd
            className={`mt-0.5 text-sm font-semibold tabular-nums ${
              SUMMARY_TONE_CLASS[item.tone ?? "default"]
            }`}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

interface ChartYAxisGridProps {
  domain: ChartDomain;
  dims: ChartDimensions;
  formatTick: (value: number) => string;
}

export function ChartYAxisGrid({ domain, dims, formatTick }: ChartYAxisGridProps) {
  return (
    <>
      {domain.ticks.map((tick) => {
        const y = scaleYValue(tick, domain, dims);
        const isBaseline = tick === domain.min;
        return (
          <g key={tick}>
            <line
              x1={dims.padLeft}
              y1={y}
              x2={dims.width - dims.padRight}
              y2={y}
              stroke={isBaseline ? "rgb(var(--c-line-strong))" : "rgb(var(--c-line))"}
              strokeWidth={1}
            />
            <text
              x={dims.padLeft - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="rgb(var(--c-ink-muted))"
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {formatTick(tick)}
            </text>
          </g>
        );
      })}
    </>
  );
}
