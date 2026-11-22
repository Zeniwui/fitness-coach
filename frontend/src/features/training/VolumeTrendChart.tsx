import { useMemo, useState } from "react";
import { formatCompactDateLabel } from "../../ui/chartMath";
import { Select } from "../../ui/Field";
import { SvgBarChart, type BarChartPoint } from "../../ui/SvgBarChart";
import type { ChartSummaryItem } from "../../ui/SvgLineChart";
import { Surface } from "../../ui/Surface";
import type { TrainingSessionResponse } from "./types";
import { aggregateWeeklyEffectiveVolume, selectWeeklyVolumeSeries } from "./volumeProgression";

interface VolumeTrendChartProps {
  sessions: TrainingSessionResponse[];
}

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function capitalizeLabel(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function VolumeTrendChart({ sessions }: VolumeTrendChartProps) {
  const volumeData = useMemo(() => aggregateWeeklyEffectiveVolume(sessions), [sessions]);
  const [selectedMuscle, setSelectedMuscle] = useState<string>("all");

  const activeMuscle =
    selectedMuscle === "all" || volumeData.muscleGroups.includes(selectedMuscle)
      ? selectedMuscle
      : "all";

  if (volumeData.weeks.length < 2) {
    const onlyWeek = volumeData.weeks[0];
    return (
      <Surface variant="default" padded="md" className="space-y-3">
        <div className="space-y-1">
          <h3 className="heading-section text-lg text-ink">
            Evolución multi-semana de volumen efectivo
          </h3>
          <p className="text-xs text-ink-muted">
            Series efectivas semanales (directas = 1.0, secundarias = 0.5) por grupo muscular.
          </p>
        </div>

        <div
          role="status"
          className="rounded-control border border-line bg-surface-muted/50 px-4 py-3.5 text-sm leading-relaxed text-ink-muted"
        >
          {onlyWeek ? (
            <p>
              Tienes 1 semana registrada (
              <span className="font-semibold text-ink tabular-nums">
                {formatSets(onlyWeek.totalEffectiveSets)} series efectivas
              </span>{" "}
              en la semana del {formatCompactDateLabel(onlyWeek.weekStart)}). Registra Sesiones de
              Entrenamiento en <strong className="font-semibold text-ink">1 semana más</strong>{" "}
              para comparar la tendencia multi-semana.
            </p>
          ) : (
            <p>
              Aún no hay Sesiones de Entrenamiento con series efectivas. Registra sesiones en al
              menos <strong className="font-semibold text-ink">2 semanas</strong> para visualizar la
              evolución multi-semana.
            </p>
          )}
        </div>
      </Surface>
    );
  }

  const series = selectWeeklyVolumeSeries(volumeData, activeMuscle);
  const totalAcrossWeeks = series.reduce((sum, pt) => sum + pt.effectiveSets, 0);
  const avgPerWeek = Math.round((totalAcrossWeeks / series.length) * 10) / 10;
  const firstPoint = series[0];
  const latestPoint = series[series.length - 1];
  const deltaFromFirst = Math.round((latestPoint.effectiveSets - firstPoint.effectiveSets) * 10) / 10;
  const peakSets = Math.max(...series.map((pt) => pt.effectiveSets));

  const scopeLabel = activeMuscle === "all" ? "Todos los grupos" : capitalizeLabel(activeMuscle);

  const barPoints: BarChartPoint[] = series.map((pt) => ({
    id: pt.weekStart,
    label: formatCompactDateLabel(pt.weekStart),
    fullLabel: `Semana del ${pt.weekStart}`,
    value: pt.effectiveSets,
    detail: `${pt.sessionCount} ${pt.sessionCount === 1 ? "sesión" : "sesiones"}`,
  }));

  const summaryItems: ChartSummaryItem[] = [
    {
      label: "Última semana",
      value: `${formatSets(latestPoint.effectiveSets)} series`,
      tone: "accent",
    },
    {
      label: "Media semanal",
      value: `${formatSets(avgPerWeek)} series/sem`,
      tone: "secondary",
    },
    {
      label: "Máximo semanal",
      value: `${formatSets(peakSets)} series`,
    },
    {
      label: "Cambio vs inicio",
      value: `${deltaFromFirst > 0 ? "+" : ""}${formatSets(deltaFromFirst)} series`,
    },
  ];

  const ariaLabel = `Evolución multi-semana de volumen efectivo (${scopeLabel}) en ${
    series.length
  } semanas: última semana ${formatSets(latestPoint.effectiveSets)} series efectivas, media ${formatSets(
    avgPerWeek,
  )} series por semana.`;

  return (
    <Surface variant="default" padded="md" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="heading-section text-lg text-ink">
            Evolución multi-semana de volumen efectivo
          </h3>
          <p className="text-xs text-ink-muted tabular-nums">
            {series.length} semanas registradas · directas = 1.0, secundarias = 0.5.
          </p>
        </div>

        <label className="block space-y-1 text-xs font-medium text-ink-muted sm:w-60">
          <span>Filtrar volumen por grupo muscular</span>
          <Select
            compact
            value={activeMuscle}
            onChange={(e) => setSelectedMuscle(e.target.value)}
          >
            <option value="all">Todos los grupos</option>
            {volumeData.muscleGroups.map((mg) => (
              <option key={mg} value={mg}>
                {capitalizeLabel(mg)}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <SvgBarChart
        ariaLabel={ariaLabel}
        points={barPoints}
        valueLabel="Series efectivas"
        detailLabel="Sesiones"
        tone="accent"
        formatTick={formatSets}
        formatValue={(v) => `${formatSets(v)} series`}
        referenceValue={avgPerWeek}
        referenceLabel={`Media semanal (${formatSets(avgPerWeek)} series)`}
        summaryItems={summaryItems}
        tableCaption={`Volumen efectivo semanal para ${scopeLabel}`}
      />
    </Surface>
  );
}
