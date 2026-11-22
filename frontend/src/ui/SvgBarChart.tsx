import { useId } from "react";
import { computeNiceDomain, scaleYValue, type ChartDimensions } from "./chartMath";
import {
  ChartEmptyState,
  ChartSummaryStrip,
  ChartYAxisGrid,
  defaultFormatNumber,
  type ChartSummaryItem,
} from "./SvgChartShared";

export interface BarChartPoint {
  id: string;
  label: string;
  fullLabel: string;
  value: number;
  detail?: string;
}

export interface SvgBarChartProps {
  ariaLabel: string;
  points: BarChartPoint[];
  valueLabel: string;
  detailLabel?: string;
  tone?: "accent" | "secondary";
  formatTick?: (value: number) => string;
  formatValue?: (value: number) => string;
  referenceValue?: number | null;
  referenceLabel?: string;
  summaryItems?: ChartSummaryItem[];
  tableCaption: string;
  minPoints?: number;
  emptyMessage?: string;
}

const DEFAULT_DIMS: ChartDimensions = {
  width: 560,
  height: 224,
  padTop: 22,
  padRight: 18,
  padBottom: 34,
  padLeft: 46,
};

const TONE_FILL: Record<NonNullable<SvgBarChartProps["tone"]>, string> = {
  accent: "rgb(var(--c-accent))",
  secondary: "rgb(var(--c-secondary))",
};

export function SvgBarChart({
  ariaLabel,
  points,
  valueLabel,
  detailLabel,
  tone = "accent",
  formatTick = defaultFormatNumber,
  formatValue = defaultFormatNumber,
  referenceValue = null,
  referenceLabel,
  summaryItems,
  tableCaption,
  minPoints = 2,
  emptyMessage = "No hay suficientes datos para mostrar esta gráfica.",
}: SvgBarChartProps) {
  const titleId = useId();

  if (points.length < minPoints) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  const domainValues = points.map((p) => p.value);
  if (referenceValue !== null && Number.isFinite(referenceValue)) {
    domainValues.push(referenceValue);
  }

  const domain = computeNiceDomain(domainValues, {
    includeZero: true,
    tickCount: 4,
    minSpan: 2,
  });

  const plotWidth = DEFAULT_DIMS.width - DEFAULT_DIMS.padLeft - DEFAULT_DIMS.padRight;
  const baselineY = DEFAULT_DIMS.height - DEFAULT_DIMS.padBottom;
  const slotWidth = plotWidth / Math.max(1, points.length);
  const barWidth = Math.max(12, Math.min(44, slotWidth * 0.56));
  const showBarLabels = points.length <= 8;
  const labelEvery = points.length > 7 ? Math.ceil(points.length / 6) : 1;

  return (
    <div className="space-y-3">
      <ChartSummaryStrip items={summaryItems} />

      {referenceValue !== null && referenceLabel && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="14" height="10" viewBox="0 0 14 10">
              <rect x="1" y="1" width="12" height="8" rx="2" fill={TONE_FILL[tone]} />
            </svg>
            <span>{valueLabel}</span>
          </span>
          <span className="inline-flex items-center gap-2">
            <svg aria-hidden="true" width="20" height="10" viewBox="0 0 20 10">
              <line
                x1="1"
                y1="5"
                x2="19"
                y2="5"
                stroke="rgb(var(--c-secondary))"
                strokeWidth="2"
                strokeDasharray="5 3"
              />
            </svg>
            <span>{referenceLabel}</span>
          </span>
        </div>
      )}

      <div className="w-full overflow-hidden">
        <svg
          role="img"
          aria-label={ariaLabel}
          aria-labelledby={titleId}
          viewBox={`0 0 ${DEFAULT_DIMS.width} ${DEFAULT_DIMS.height}`}
          preserveAspectRatio="xMidYMid meet"
          className="block h-auto w-full select-none"
        >
          <title id={titleId}>{ariaLabel}</title>

          <ChartYAxisGrid domain={domain} dims={DEFAULT_DIMS} formatTick={formatTick} />

          {/* Optional horizontal reference line */}
          {referenceValue !== null && Number.isFinite(referenceValue) && (
            <line
              x1={DEFAULT_DIMS.padLeft}
              y1={scaleYValue(referenceValue, domain, DEFAULT_DIMS)}
              x2={DEFAULT_DIMS.width - DEFAULT_DIMS.padRight}
              y2={scaleYValue(referenceValue, domain, DEFAULT_DIMS)}
              stroke="rgb(var(--c-secondary))"
              strokeWidth={1.75}
              strokeDasharray="6 4"
            />
          )}

          {/* Bars and labels */}
          {points.map((pt, idx) => {
            const centerX = DEFAULT_DIMS.padLeft + slotWidth * idx + slotWidth / 2;
            const barX = Math.round((centerX - barWidth / 2) * 100) / 100;
            const topY = scaleYValue(pt.value, domain, DEFAULT_DIMS);
            const barHeight = Math.max(0, Math.round((baselineY - topY) * 100) / 100);
            const showXLabel = idx === 0 || idx === points.length - 1 || idx % labelEvery === 0;

            return (
              <g key={pt.id}>
                {barHeight > 0 && (
                  <rect
                    x={barX}
                    y={topY}
                    width={barWidth}
                    height={barHeight}
                    rx={3}
                    fill={TONE_FILL[tone]}
                  />
                )}
                {showBarLabels && (
                  <text
                    x={centerX}
                    y={Math.max(DEFAULT_DIMS.padTop - 4, topY - 5)}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgb(var(--c-ink-muted))"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {formatTick(pt.value)}
                  </text>
                )}
                {showXLabel && (
                  <text
                    x={centerX}
                    y={DEFAULT_DIMS.height - 10}
                    textAnchor="middle"
                    fontSize="11"
                    fill="rgb(var(--c-ink-muted))"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {pt.label}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Accessible tabular breakdown */}
      <details className="group border-t border-line pt-2">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-ink-muted hover:text-ink sm:min-h-[32px]">
          Ver tabla de datos ({points.length} semanas)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <caption className="sr-only">{tableCaption}</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="py-1.5 pr-4 font-medium">
                  Semana
                </th>
                <th scope="col" className="py-1.5 pr-4 font-medium">
                  {valueLabel}
                </th>
                {detailLabel && (
                  <th scope="col" className="py-1.5 pr-4 font-medium">
                    {detailLabel}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-ink">
              {points.map((pt) => (
                <tr key={pt.id}>
                  <th scope="row" className="py-1.5 pr-4 font-normal text-ink-muted">
                    {pt.fullLabel}
                  </th>
                  <td className="py-1.5 pr-4 font-medium">{formatValue(pt.value)}</td>
                  {detailLabel && <td className="py-1.5 pr-4 text-ink-muted">{pt.detail ?? "—"}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
