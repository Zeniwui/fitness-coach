import { useMemo, useState } from "react";
import { formatCompactDateLabel } from "../../ui/chartMath";
import { Select } from "../../ui/Field";
import {
  SvgLineChart,
  type ChartSummaryItem,
  type LineChartSeries,
} from "../../ui/SvgLineChart";
import { Surface } from "../../ui/Surface";
import type { TrainingSessionResponse } from "./types";
import { aggregateExerciseProgression } from "./volumeProgression";

interface ExerciseE1rmChartProps {
  sessions: TrainingSessionResponse[];
}

function formatKg(value: number): string {
  return `${value.toFixed(1)} kg`;
}

function formatSignedKg(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)} kg`;
}

export function ExerciseE1rmChart({ sessions }: ExerciseE1rmChartProps) {
  const exercises = useMemo(() => aggregateExerciseProgression(sessions), [sessions]);
  const [selectedKey, setSelectedKey] = useState<string>("");

  const activeExercise =
    exercises.find((ex) => ex.exerciseKey === selectedKey) ?? exercises[0] ?? null;

  if (!activeExercise) {
    return (
      <Surface variant="default" padded="md" className="space-y-3">
        <div className="space-y-1">
          <h3 className="heading-section text-lg text-ink">
            Progresión de fuerza estimada (e1RM)
          </h3>
          <p className="text-xs text-ink-muted">
            Evolución de 1RM estimado (Epley, ≤12 reps) y mejor carga normalizada a kg por
            ejercicio.
          </p>
        </div>

        <div
          role="status"
          className="rounded-control border border-line bg-surface-muted/50 px-4 py-3.5 text-sm leading-relaxed text-ink-muted"
        >
          Necesitas <strong className="font-semibold text-ink">al menos 2 Sesiones de Entrenamiento</strong>{" "}
          registradas del mismo ejercicio con carga para visualizar la progresión de e1RM y mejor
          carga.
        </div>
      </Surface>
    );
  }

  const bestLoadSeries: LineChartSeries = {
    id: "best-load",
    label: "Mejor carga (kg)",
    tone: activeExercise.hasE1rmSeries ? "secondary" : "accent",
    dashed: activeExercise.hasE1rmSeries,
    showArea: !activeExercise.hasE1rmSeries,
    points: activeExercise.points.map((pt) => ({
      id: `${pt.sessionId}-load`,
      label: formatCompactDateLabel(pt.sessionDate),
      fullLabel: pt.sessionDate,
      value: pt.bestLoadKg,
      formattedValue:
        pt.displayUnit === "lb"
          ? `${formatKg(pt.bestLoadKg)} (${pt.displayLoad} lb × ${pt.displayReps})`
          : `${formatKg(pt.bestLoadKg)} (${pt.displayReps} reps)`,
    })),
  };

  const series: LineChartSeries[] = activeExercise.hasE1rmSeries
    ? [
        {
          id: "e1rm",
          label: "e1RM estimado (kg)",
          tone: "accent",
          showArea: true,
          points: activeExercise.points.map((pt) => ({
            id: `${pt.sessionId}-e1rm`,
            label: formatCompactDateLabel(pt.sessionDate),
            fullLabel: pt.sessionDate,
            value: pt.bestE1rmKg,
            formattedValue: pt.bestE1rmKg !== null ? formatKg(pt.bestE1rmKg) : "— (>12 reps)",
          })),
        },
        bestLoadSeries,
      ]
    : [bestLoadSeries];

  const summaryItems: ChartSummaryItem[] = [];
  if (activeExercise.latestE1rmKg !== null) {
    summaryItems.push({
      label: "Último e1RM",
      value: formatKg(activeExercise.latestE1rmKg),
      tone: "accent",
    });
  }
  if (activeExercise.e1rmDeltaKg !== null) {
    summaryItems.push({
      label: "Cambio e1RM",
      value: formatSignedKg(activeExercise.e1rmDeltaKg),
      tone:
        activeExercise.e1rmDeltaKg > 0
          ? "success"
          : activeExercise.e1rmDeltaKg < 0
            ? "warning"
            : "default",
    });
  }
  summaryItems.push(
    {
      label: "Última mejor carga",
      value: formatKg(activeExercise.latestBestLoadKg),
      tone: "secondary",
    },
    {
      label: "Sesiones",
      value: String(activeExercise.points.length),
    },
  );

  const e1rmAriaPart =
    activeExercise.latestE1rmKg !== null
      ? `último e1RM ${formatKg(activeExercise.latestE1rmKg)}${
          activeExercise.e1rmDeltaKg !== null
            ? ` (${formatSignedKg(activeExercise.e1rmDeltaKg)})`
            : ""
        }, `
      : "";

  const ariaLabel = `Progresión de fuerza para ${activeExercise.exerciseName} en ${
    activeExercise.points.length
  } sesiones: ${e1rmAriaPart}última mejor carga ${formatKg(activeExercise.latestBestLoadKg)}.`;

  return (
    <Surface variant="default" padded="md" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="heading-section text-lg text-ink">
            Progresión de fuerza estimada (e1RM)
          </h3>
          <p className="text-xs text-ink-muted tabular-nums">
            Fórmula de Epley (≤12 reps) y mejor carga convertida a kg ({activeExercise.points.length}{" "}
            sesiones).
          </p>
        </div>

        <label className="block space-y-1 text-xs font-medium text-ink-muted sm:w-64">
          <span>Seleccionar ejercicio</span>
          <Select
            compact
            value={activeExercise.exerciseKey}
            onChange={(e) => setSelectedKey(e.target.value)}
          >
            {exercises.map((ex) => (
              <option key={ex.exerciseKey} value={ex.exerciseKey}>
                {ex.exerciseName} ({ex.points.length} sesiones)
              </option>
            ))}
          </Select>
        </label>
      </div>

      <SvgLineChart
        ariaLabel={ariaLabel}
        series={series}
        formatTick={(v) => v.toFixed(1)}
        formatValue={formatKg}
        summaryItems={summaryItems}
        tableCaption={`Progresión de e1RM y mejor carga para ${activeExercise.exerciseName}`}
      />
    </Surface>
  );
}
