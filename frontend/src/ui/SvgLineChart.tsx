import { useId } from "react";
import {
  buildSvgAreaPath,
  buildSvgPolylinePoints,
  computeNiceDomain,
  scaleXIndex,
  scaleYValue,
  type ChartDimensions,
} from "./chartMath";
import {
  ChartEmptyState,
  ChartSummaryStrip,
  ChartYAxisGrid,
  defaultFormatNumber,
  type ChartSummaryItem,
} from "./SvgChartShared";

export type { ChartSummaryItem };

export interface LineSeriesPoint {
  id: string;
  label: string;
  fullLabel: string;
  value: number | null;
  formattedValue?: string;
}

export interface LineChartSeries {
  id: string;
  label: string;
  tone: "accent" | "secondary";
  dashed?: boolean;
  showArea?: boolean;
  points: LineSeriesPoint[];
}

export interface SvgLineChartProps {
  ariaLabel: string;
  series: LineChartSeries[];
  formatTick?: (value: number) => string;
  formatValue?: (value: number) => string;
  summaryItems?: ChartSummaryItem[];
  tableCaption: string;
  minPoints?: number;
  emptyMessage?: string;
  includeZero?: boolean;
}

const DEFAULT_DIMS: ChartDimensions = {
  width: 560,
  height: 224,
  padTop: 18,
  padRight: 18,
  padBottom: 34,
  padLeft: 54,
};

const TONE_STROKE: Record<LineChartSeries["tone"], string> = {
  accent: "rgb(var(--c-accent))",
  secondary: "rgb(var(--c-secondary))",
};

const TONE_AREA_FILL: Record<LineChartSeries["tone"], string> = {
  accent: "rgb(var(--c-accent) / 0.12)",
  secondary: "rgb(var(--c-secondary) / 0.12)",
};

function pickVisibleTickIndices(count: number, maxLabels = 6): Set<number> {
  const visible = new Set<number>();
  if (count <= 0) return visible;
  if (count <= maxLabels) {
    for (let i = 0; i < count; i += 1) visible.add(i);
    return visible;
  }
  visible.add(0);
  visible.add(count - 1);
  const step = Math.ceil((count - 1) / (maxLabels - 1));
  for (let i = step; i < count - 1; i += step) {
    visible.add(i);
  }
  return visible;
}

export function SvgLineChart({
  ariaLabel,
  series,
  formatTick = defaultFormatNumber,
  formatValue = defaultFormatNumber,
  summaryItems,
  tableCaption,
  minPoints = 2,
  emptyMessage = "No hay suficientes datos para trazar esta gráfica.",
  includeZero = false,
}: SvgLineChartProps) {
  const titleId = useId();
  const primarySeries = series[0];
  const pointCount = primarySeries?.points.length ?? 0;
  const primaryFiniteCount =
    primarySeries?.points.filter((pt) => pt.value !== null && Number.isFinite(pt.value)).length ??
    0;

  if (!primarySeries || primaryFiniteCount < minPoints) {
    return <ChartEmptyState message={emptyMessage} />;
  }

  const allValues = series.flatMap((s) =>
    s.points
      .map((pt) => pt.value)
      .filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  const domain = computeNiceDomain(allValues, { includeZero, tickCount: 4 });
  const baselineY = DEFAULT_DIMS.height - DEFAULT_DIMS.padBottom;
  const visibleXIndices = pickVisibleTickIndices(pointCount, 6);

  return (
    <div className="space-y-3">
      <ChartSummaryStrip items={summaryItems} />

      {series.length > 1 && (
        <ul
          aria-label="Leyenda de series"
          className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-ink-muted"
        >
          {series.map((s) => (
            <li key={s.id} className="inline-flex items-center gap-2">
              <svg aria-hidden="true" width="22" height="10" viewBox="0 0 22 10">
                <line
                  x1="1"
                  y1="5"
                  x2="21"
                  y2="5"
                  stroke={TONE_STROKE[s.tone]}
                  strokeWidth="2.2"
                  strokeDasharray={s.dashed ? "5 3" : undefined}
                  strokeLinecap="round"
                />
                {!s.dashed && (
                  <circle
                    cx="11"
                    cy="5"
                    r="3"
                    fill={TONE_STROKE[s.tone]}
                    stroke="rgb(var(--c-surface))"
                    strokeWidth="1.2"
                  />
                )}
              </svg>
              <span>{s.label}</span>
            </li>
          ))}
        </ul>
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

          {/* Series paths and markers (render secondary/dashed behind primary) */}
          {[...series].reverse().map((s) => {
            const mapped = s.points
              .map((pt, idx) =>
                pt.value !== null && Number.isFinite(pt.value)
                  ? {
                      id: pt.id,
                      x: scaleXIndex(idx, pointCount, DEFAULT_DIMS),
                      y: scaleYValue(pt.value, domain, DEFAULT_DIMS),
                    }
                  : null,
              )
              .filter((p): p is { id: string; x: number; y: number } => p !== null);

            if (mapped.length === 0) return null;

            const stroke = TONE_STROKE[s.tone];
            return (
              <g key={s.id}>
                {s.showArea && mapped.length >= 2 && (
                  <path d={buildSvgAreaPath(mapped, baselineY)} fill={TONE_AREA_FILL[s.tone]} />
                )}
                {mapped.length >= 2 && (
                  <polyline
                    fill="none"
                    stroke={stroke}
                    strokeWidth={s.dashed ? 2 : 2.5}
                    strokeDasharray={s.dashed ? "6 4" : undefined}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    points={buildSvgPolylinePoints(mapped)}
                  />
                )}
                {!s.dashed &&
                  mapped.map((pt) => (
                    <circle
                      key={pt.id}
                      cx={pt.x}
                      cy={pt.y}
                      r={4}
                      fill={stroke}
                      stroke="rgb(var(--c-surface))"
                      strokeWidth={1.75}
                    />
                  ))}
              </g>
            );
          })}

          {/* X-axis labels */}
          {primarySeries.points.map((pt, idx) => {
            if (!visibleXIndices.has(idx)) return null;
            const x = scaleXIndex(idx, pointCount, DEFAULT_DIMS);
            const anchor =
              idx === 0 && pointCount > 1
                ? "start"
                : idx === pointCount - 1 && pointCount > 1
                  ? "end"
                  : "middle";
            return (
              <text
                key={pt.id}
                x={x}
                y={DEFAULT_DIMS.height - 10}
                textAnchor={anchor}
                fontSize="11"
                fill="rgb(var(--c-ink-muted))"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {pt.label}
              </text>
            );
          })}
        </svg>
      </div>

      {/* Accessible tabular data breakdown for screen readers and keyboard inspection */}
      <details className="group border-t border-line pt-2">
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-xs font-medium text-ink-muted hover:text-ink sm:min-h-[32px]">
          Ver tabla de datos ({pointCount} registros)
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs tabular-nums">
            <caption className="sr-only">{tableCaption}</caption>
            <thead>
              <tr className="border-b border-line text-ink-muted">
                <th scope="col" className="py-1.5 pr-4 font-medium">
                  Fecha
                </th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="py-1.5 pr-4 font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 text-ink">
              {primarySeries.points.map((pt, idx) => (
                <tr key={pt.id}>
                  <th scope="row" className="py-1.5 pr-4 font-normal text-ink-muted">
                    {pt.fullLabel}
                  </th>
                  {series.map((s) => {
                    const cell = s.points[idx];
                    const display =
                      cell?.formattedValue ??
                      (cell?.value !== null && cell?.value !== undefined
                        ? formatValue(cell.value)
                        : "—");
                    return (
                      <td key={s.id} className="py-1.5 pr-4 font-medium">
                        {display}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
