import { formatCompactDateLabel, projectWeeklyTargetLine } from "../../ui/chartMath";
import {
  SvgLineChart,
  type ChartSummaryItem,
  type LineChartSeries,
} from "../../ui/SvgLineChart";
import { Surface } from "../../ui/Surface";
import type { NutritionPhaseResponse, WeeklyCheckInResponse } from "./labels";

interface WeightTrendChartProps {
  checkins: WeeklyCheckInResponse[];
  activePhase: NutritionPhaseResponse | null;
}

function formatWeightKg(value: number): string {
  return `${value.toFixed(1)} kg`;
}

function formatSignedRate(rate: number): string {
  return `${rate > 0 ? "+" : ""}${rate}`;
}

function formatSignedDeltaKg(delta: number): string {
  const fixed = delta.toFixed(1);
  return `${delta > 0 ? "+" : ""}${fixed} kg`;
}

export function WeightTrendChart({ checkins, activePhase }: WeightTrendChartProps) {
  const ordered = [...checkins].sort((a, b) => {
    const byDate = a.checkin_date.localeCompare(b.checkin_date);
    if (byDate !== 0) return byDate;
    return (a.created_at ?? "").localeCompare(b.created_at ?? "");
  });

  if (ordered.length < 2) {
    const remaining = 2 - ordered.length;
    const single = ordered[0];
    return (
      <Surface variant="default" padded="md" className="space-y-3">
        <div className="space-y-1">
          <h2 className="heading-section text-lg text-ink">Tendencia de peso semanal</h2>
          <p className="text-xs text-ink-muted">
            Evolución cronológica de tus Check-ins frente al ritmo semanal objetivo.
          </p>
        </div>

        <div
          role="status"
          className="rounded-control border border-line bg-surface-muted/50 px-4 py-3.5 text-sm leading-relaxed text-ink-muted"
        >
          {single ? (
            <p>
              Tienes 1 Check-in registrado (
              <span className="font-semibold text-ink tabular-nums">
                {formatWeightKg(single.average_weight_kg)}
              </span>{" "}
              el {single.checkin_date}).{" "}
              <strong className="font-semibold text-ink">Falta 1 Check-in más</strong> para trazar
              la tendencia de peso semanal.
            </p>
          ) : (
            <p>
              Aún no hay Check-ins registrados.{" "}
              <strong className="font-semibold text-ink">
                Faltan {remaining} Check-ins
              </strong>{" "}
              para trazar la tendencia de peso semanal.
            </p>
          )}
        </div>
      </Surface>
    );
  }

  const dates = ordered.map((c) => c.checkin_date);
  const first = ordered[0];
  const latest = ordered[ordered.length - 1];
  const totalDelta = Math.round((latest.average_weight_kg - first.average_weight_kg) * 100) / 100;

  const actualSeries: LineChartSeries = {
    id: "actual-weight",
    label: "Peso medio semanal",
    tone: "accent",
    showArea: true,
    points: ordered.map((c) => ({
      id: c.id,
      label: formatCompactDateLabel(c.checkin_date),
      fullLabel: c.checkin_date,
      value: c.average_weight_kg,
      formattedValue: formatWeightKg(c.average_weight_kg),
    })),
  };

  const hasTargetRate =
    activePhase !== null && Number.isFinite(activePhase.target_weekly_weight_change_kg);
  const targetRate = activePhase?.target_weekly_weight_change_kg ?? null;

  const series: LineChartSeries[] = [actualSeries];
  if (hasTargetRate && targetRate !== null) {
    const projected = projectWeeklyTargetLine(dates, first.average_weight_kg, targetRate);
    series.push({
      id: "target-projection",
      label: `Proyección objetivo (${formatSignedRate(targetRate)} kg/sem)`,
      tone: "secondary",
      dashed: true,
      points: ordered.map((c, idx) => ({
        id: `${c.id}-target`,
        label: formatCompactDateLabel(c.checkin_date),
        fullLabel: c.checkin_date,
        value: projected[idx] ?? null,
        formattedValue: projected[idx] !== undefined ? formatWeightKg(projected[idx]) : "—",
      })),
    });
  }

  const summaryItems: ChartSummaryItem[] = [
    { label: "Inicio", value: formatWeightKg(first.average_weight_kg) },
    { label: "Último", value: formatWeightKg(latest.average_weight_kg), tone: "accent" },
    { label: "Cambio total", value: formatSignedDeltaKg(totalDelta) },
  ];

  if (hasTargetRate && targetRate !== null) {
    summaryItems.push({
      label: "Ritmo objetivo",
      value: `${formatSignedRate(targetRate)} kg/sem`,
      tone: "secondary",
    });
  }

  const targetAriaSuffix =
    hasTargetRate && targetRate !== null
      ? `, frente a la proyección objetivo de ${formatSignedRate(targetRate)} kg/sem`
      : "";

  const ariaLabel = `Tendencia de peso semanal con ${ordered.length} Check-ins: de ${formatWeightKg(
    first.average_weight_kg,
  )} (${first.checkin_date}) a ${formatWeightKg(latest.average_weight_kg)} (${
    latest.checkin_date
  }), cambio acumulado ${formatSignedDeltaKg(totalDelta)}${targetAriaSuffix}.`;

  return (
    <Surface variant="default" padded="md" className="space-y-4">
      <div className="space-y-1">
        <h2 className="heading-section text-lg text-ink">Tendencia de peso semanal</h2>
        <p className="text-xs text-ink-muted tabular-nums">
          {ordered.length} Check-ins ordenados cronológicamente ({first.checkin_date} a{" "}
          {latest.checkin_date}).
        </p>
      </div>

      <SvgLineChart
        ariaLabel={ariaLabel}
        series={series}
        formatTick={(v) => v.toFixed(1)}
        formatValue={formatWeightKg}
        summaryItems={summaryItems}
        tableCaption="Historial cronológico de peso medio semanal y proyección objetivo"
      />
    </Surface>
  );
}
