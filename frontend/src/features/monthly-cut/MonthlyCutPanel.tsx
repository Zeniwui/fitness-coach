import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Badge, type BadgeTone } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import { MONTHLY_CUT_RUN_TYPE_LABELS } from "../science/labels";

type MonthlyCutRun = components["schemas"]["MonthlyCutRunResponse"];

const STATUS_LABELS: Record<MonthlyCutRun["status"], string> = {
  queued: "En cola",
  collecting: "Recolectando",
  filtering: "Filtrando",
  analyzing: "Analizando",
  completed: "Completado",
  paused_rate_limit: "Pausado por cuota",
  failed: "Fallido",
};

const STATUS_TONES: Record<MonthlyCutRun["status"], BadgeTone> = {
  queued: "neutral",
  collecting: "secondary",
  filtering: "secondary",
  analyzing: "accent",
  completed: "success",
  paused_rate_limit: "warning",
  failed: "danger",
};

export function MonthlyCutPanel() {
  const [runs, setRuns] = useState<MonthlyCutRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [queryOverride, setQueryOverride] = useState("");
  const [maxCandidates, setMaxCandidates] = useState(12);

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: apiErr } = await apiClient.GET("/api/v1/curator/monthly-cuts");
    setLoading(false);
    if (apiErr || !data) {
      setError("No se pudo cargar el historial del Corte Mensual.");
      return;
    }
    setRuns(data.items);
  }, []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);

  async function handleTriggerRun(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setFeedback(null);
    setError(null);
    const { data, error: apiErr } = await apiClient.POST("/api/v1/curator/monthly-cuts", {
      body: {
        date_from: dateFrom || null,
        date_to: dateTo || null,
        query_override: queryOverride.trim() || null,
        max_candidates: maxCandidates,
      },
    });
    setBusy(false);
    if (apiErr || !data) {
      setError("Error al ejecutar el Corte Mensual.");
      return;
    }
    setFeedback(
      data.status === "paused_rate_limit"
        ? `Corte Mensual pausado por cuota en el punto ${data.checkpoint_next_index}/${data.checkpoint_queue_size}.`
        : `Corte Mensual ejecutado (${data.analyzed_count} Estudios Candidatos analizados).`,
    );
    await loadRuns();
  }

  async function handleResumeRun(runId: string) {
    setBusy(true);
    setFeedback(null);
    setError(null);
    const { data, error: apiErr } = await apiClient.POST(
      "/api/v1/curator/monthly-cuts/{run_id}/resume",
      { params: { path: { run_id: runId } } },
    );
    setBusy(false);
    if (apiErr || !data) {
      setError("No se pudo reanudar el Corte Mensual desde el último punto guardado.");
      return;
    }
    setFeedback(
      data.status === "completed"
        ? `Corte reanudado y completado (${data.analyzed_count} Estudios Candidatos analizados).`
        : `Corte reanudado: estado actual ${STATUS_LABELS[data.status]}.`,
    );
    await loadRuns();
  }

  async function handleLoadSeedBatch() {
    setBusy(true);
    setFeedback(null);
    setError(null);
    const { data, error: apiErr } = await apiClient.POST("/api/v1/curator/seed-batch");
    setBusy(false);
    if (apiErr || !data) {
      setError("No se pudo cargar el Lote Semilla fundacional.");
      return;
    }
    setFeedback(
      data.created_count > 0
        ? `Lote Semilla cargado: ${data.created_count} estudios fundacionales añadidos a la Bandeja del Curador (${data.skipped_count} ya existentes omitidos).`
        : `Lote Semilla ya estaba cargado (${data.skipped_count} estudios omitidos sin duplicados).`,
    );
    await loadRuns();
  }

  return (
    <section className="space-y-5">
      <Surface variant="focal" padded="md" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h2 className="heading-section text-xl text-ink">Ejecutar Corte Mensual</h2>
            <p className="max-w-2xl text-xs leading-relaxed text-ink-muted">
              Recolecta literatura de PubMed, Europe PMC, Crossref y SportRxiv con filtrado
              automático, tope configurable y guardado de progreso si se alcanza el límite de cuota.
            </p>
          </div>
          <Button
            variant="soft"
            size="sm"
            disabled={busy}
            onClick={() => void handleLoadSeedBatch()}
            className="shrink-0"
          >
            Cargar Lote Semilla
          </Button>
        </div>

        <form onSubmit={(e) => void handleTriggerRun(e)} className="space-y-3.5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="mc-date-from" className="mb-1 block text-xs text-ink-muted">
                Fecha inicio
              </label>
              <Input
                compact
                id="mc-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="mc-date-to" className="mb-1 block text-xs text-ink-muted">
                Fecha fin
              </label>
              <Input
                compact
                id="mc-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="mc-max-candidates" className="mb-1 block text-xs text-ink-muted">
                Tope de Estudios Candidatos
              </label>
              <Input
                compact
                id="mc-max-candidates"
                type="number"
                min={1}
                max={50}
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(Number(e.target.value) || 12)}
                className="tabular-nums"
              />
            </div>
          </div>

          <div>
            <label htmlFor="mc-query-override" className="mb-1 block text-xs text-ink-muted">
              Consulta científica opcional
            </label>
            <Input
              id="mc-query-override"
              type="text"
              value={queryOverride}
              onChange={(e) => setQueryOverride(e.target.value)}
              placeholder="Ej.: hypertrophy proximity to failure creatine..."
            />
          </div>

          <Button type="submit" disabled={busy}>
            Ejecutar Corte Mensual
          </Button>
        </form>

        {feedback && <AlertBanner tone="success">{feedback}</AlertBanner>}
        {error && <AlertBanner tone="error">{error}</AlertBanner>}
      </Surface>

      <div className="space-y-3">
        <h3 className="heading-section text-lg text-ink">Historial de ejecuciones</h3>
        {loading ? (
          <p role="status" className="text-sm text-ink-muted">
            Cargando historial del Corte Mensual…
          </p>
        ) : runs.length === 0 ? (
          <Surface variant="inset" padded="md" className="text-xs text-ink-muted">
            Aún no hay ejecuciones registradas del Corte Mensual.
          </Surface>
        ) : (
          <ul className="space-y-3">
            {runs.map((run) => (
              <li
                key={run.id}
                className="space-y-3 rounded-panel border border-line bg-surface p-4 shadow-panel"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={STATUS_TONES[run.status]}>{STATUS_LABELS[run.status]}</Badge>
                    <span className="text-xs font-medium text-ink-muted">
                      {MONTHLY_CUT_RUN_TYPE_LABELS[run.run_type] ?? run.run_type}
                    </span>
                  </div>
                  <span className="text-xs text-ink-muted tabular-nums">
                    {run.date_from || run.date_to
                      ? `${run.date_from ?? "…"} a ${run.date_to ?? "…"}`
                      : new Date(run.started_at).toLocaleDateString("es-ES")}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2 rounded-control border border-line bg-surface-muted/50 p-3 text-xs tabular-nums sm:grid-cols-3">
                  <div>
                    <span className="text-ink-muted">Recolectados:</span>{" "}
                    <strong className="text-ink">{run.collected_count}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted">Filtrados:</span>{" "}
                    <strong className="text-ink">{run.filtered_count}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted">Analizados:</span>{" "}
                    <strong className="text-ink">
                      {run.analyzed_count} / {run.max_candidates}
                    </strong>
                  </div>
                </div>

                {run.sources.length > 0 && (
                  <p className="text-xs text-ink-muted">Fuentes: {run.sources.join(", ")}</p>
                )}

                {run.pause_reason && (
                  <p className="rounded-control border border-warning/35 bg-warning-soft px-3 py-2 text-xs text-warning-text">
                    Motivo de pausa: {run.pause_reason} (Progreso: {run.checkpoint_next_index}/
                    {run.checkpoint_queue_size})
                  </p>
                )}

                {run.error_message && (
                  <p className="rounded-control border border-danger/35 bg-danger-soft px-3 py-2 text-xs text-danger-text">
                    Error: {run.error_message}
                  </p>
                )}

                {(run.status === "paused_rate_limit" || run.status === "failed") && (
                  <Button
                    variant="warning"
                    size="sm"
                    disabled={busy}
                    onClick={() => void handleResumeRun(run.id)}
                  >
                    Reanudar desde último punto
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
