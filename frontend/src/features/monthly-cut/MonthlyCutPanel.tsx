import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";

type MonthlyCutRun = components["schemas"]["MonthlyCutRunResponse"];

const STATUS_LABELS: Record<MonthlyCutRun["status"], string> = {
  queued: "En cola",
  collecting: "Recolectando",
  filtering: "Pre-filtrando",
  analyzing: "Analizando",
  completed: "Completado",
  paused_rate_limit: "Pausado por cuota (HTTP 429)",
  failed: "Fallido",
};

const STATUS_BADGE_CLASS: Record<MonthlyCutRun["status"], string> = {
  queued: "bg-slate-800 text-slate-300",
  collecting: "bg-sky-900/60 text-sky-300",
  filtering: "bg-sky-900/60 text-sky-300",
  analyzing: "bg-indigo-900/60 text-indigo-300",
  completed: "bg-emerald-900/60 text-emerald-300",
  paused_rate_limit: "bg-amber-900/70 text-amber-200",
  failed: "bg-rose-900/70 text-rose-200",
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
        ? `Corte Mensual pausado por cuota en checkpoint ${data.checkpoint_next_index}/${data.checkpoint_queue_size}.`
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
      setError("No se pudo reanudar el Corte Mensual desde el checkpoint.");
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
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Ejecutar Corte Mensual</h2>
            <p className="text-xs text-slate-400">
              Recolecta literatura de PubMed, Europe PMC, Crossref y SportRxiv con pre-filtrado
              determinista, tope configurable y checkpointing de cuota.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleLoadSeedBatch()}
            className="shrink-0 rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50"
          >
            Cargar Lote Semilla
          </button>
        </div>

        <form onSubmit={(e) => void handleTriggerRun(e)} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="mc-date-from" className="mb-1 block text-xs text-slate-300">
                Fecha inicio
              </label>
              <input
                id="mc-date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="mc-date-to" className="mb-1 block text-xs text-slate-300">
                Fecha fin
              </label>
              <input
                id="mc-date-to"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label htmlFor="mc-max-candidates" className="mb-1 block text-xs text-slate-300">
                Tope de Estudios Candidatos
              </label>
              <input
                id="mc-max-candidates"
                type="number"
                min={1}
                max={50}
                value={maxCandidates}
                onChange={(e) => setMaxCandidates(Number(e.target.value) || 12)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-white"
              />
            </div>
          </div>

          <div>
            <label htmlFor="mc-query-override" className="mb-1 block text-xs text-slate-300">
              Consulta científica opcional
            </label>
            <input
              id="mc-query-override"
              type="text"
              value={queryOverride}
              onChange={(e) => setQueryOverride(e.target.value)}
              placeholder="Ej.: hypertrophy proximity to failure creatine..."
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white placeholder:text-slate-500"
            />
          </div>

          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            Ejecutar Corte Mensual
          </button>
        </form>

        {feedback && (
          <p
            role="status"
            className="rounded-lg border border-emerald-700/60 bg-emerald-950/60 px-3 py-2 text-xs text-emerald-200"
          >
            {feedback}
          </p>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-rose-700/60 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
          >
            {error}
          </p>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-white">Historial de ejecuciones</h3>
        {loading ? (
          <p className="text-xs text-slate-400">Cargando historial del Corte Mensual…</p>
        ) : runs.length === 0 ? (
          <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-400">
            Aún no hay ejecuciones registradas del Corte Mensual.
          </p>
        ) : (
          <ul className="space-y-3">
            {runs.map((run) => (
              <li
                key={run.id}
                className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_BADGE_CLASS[run.status]}`}
                    >
                      {STATUS_LABELS[run.status]}
                    </span>
                    <span className="text-xs text-slate-400 uppercase">{run.run_type}</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {run.date_from || run.date_to
                      ? `${run.date_from ?? "…"} → ${run.date_to ?? "…"}`
                      : new Date(run.started_at).toLocaleDateString("es-ES")}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs text-slate-300">
                  <div>
                    <span className="text-slate-500">Recolectados:</span> {run.collected_count}
                  </div>
                  <div>
                    <span className="text-slate-500">Filtrados:</span> {run.filtered_count}
                  </div>
                  <div>
                    <span className="text-slate-500">Analizados:</span> {run.analyzed_count} /{" "}
                    {run.max_candidates}
                  </div>
                </div>

                {run.sources.length > 0 && (
                  <p className="text-[11px] text-slate-400">
                    Fuentes: {run.sources.join(", ")}
                  </p>
                )}

                {run.pause_reason && (
                  <p className="rounded-lg border border-amber-700/50 bg-amber-950/50 px-3 py-1.5 text-xs text-amber-200">
                    Motivo de pausa: {run.pause_reason} (Checkpoint:{" "}
                    {run.checkpoint_next_index}/{run.checkpoint_queue_size})
                  </p>
                )}

                {run.error_message && (
                  <p className="rounded-lg border border-rose-700/50 bg-rose-950/50 px-3 py-1.5 text-xs text-rose-200">
                    Error: {run.error_message}
                  </p>
                )}

                {(run.status === "paused_rate_limit" || run.status === "failed") && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleResumeRun(run.id)}
                    className="rounded-lg bg-amber-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                  >
                    Reanudar desde checkpoint
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
