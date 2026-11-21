import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";

type TrendingTopic = components["schemas"]["TrendingTopicResponse"];

interface TrendingTopicsPanelProps {
  isCurator: boolean;
}

const TOPIC_STATUS_LABELS: Record<TrendingTopic["status"], string> = {
  pending: "Pendiente de revisión",
  approved_context: "Aprobado como contexto",
  dismissed: "Descartado",
};

export function TrendingTopicsPanel({ isCurator }: TrendingTopicsPanelProps) {
  const [topics, setTopics] = useState<TrendingTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTopics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = isCurator
      ? await apiClient.GET("/api/v1/curator/trending-topics")
      : await apiClient.GET("/api/v1/knowledge/trending-topics");
    setLoading(false);
    if (res.error || !res.data) {
      setError("No se pudieron cargar los Temas de Actualidad.");
      return;
    }
    setTopics(res.data.items);
  }, [isCurator]);

  useEffect(() => {
    void loadTopics();
  }, [loadTopics]);

  async function handleReview(topicId: string, decision: "approved_context" | "dismissed") {
    setBusyId(topicId);
    setFeedback(null);
    setError(null);
    const { data, error: apiErr } = await apiClient.POST(
      "/api/v1/curator/trending-topics/{topic_id}/review",
      {
        params: { path: { topic_id: topicId } },
        body: { decision },
      },
    );
    setBusyId(null);
    if (apiErr || !data) {
      setError("No se pudo registrar la decisión sobre el Tema de Actualidad.");
      return;
    }
    setFeedback(
      decision === "approved_context"
        ? "Tema de Actualidad aprobado como contexto (separado de las Fichas de Evidencia)."
        : "Tema de Actualidad descartado.",
    );
    await loadTopics();
  }

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-amber-700/40 bg-amber-950/30 p-3.5 text-xs text-amber-100">
        <p className="font-semibold">Temas de Actualidad — Bloque independiente</p>
        <p className="mt-1 text-amber-200/80">
          Tendencias, debates y afirmaciones recientes del fitness contrastados frente a la Base
          de Conocimiento. Se mantienen estrictamente separados de la evidencia científica primaria
          (Fichas de Evidencia).
        </p>
      </div>

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

      {loading ? (
        <p className="text-xs text-slate-400">Cargando Temas de Actualidad…</p>
      ) : topics.length === 0 ? (
        <p className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-xs text-slate-400">
          No hay Temas de Actualidad disponibles todavía.
        </p>
      ) : (
        <ul className="space-y-3">
          {topics.map((topic) => (
            <li
              key={topic.id}
              className="rounded-xl border border-slate-800 bg-slate-900/70 p-4 space-y-2.5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-white">{topic.title}</h3>
                <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
                  {TOPIC_STATUS_LABELS[topic.status]}
                </span>
              </div>

              <p className="text-xs text-slate-300">{topic.summary}</p>

              <div className="rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs text-slate-200">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-400">
                  Contraste crítico frente a la Base de Conocimiento
                </p>
                <p>{topic.critical_evaluation}</p>
              </div>

              {topic.cited_card_ids.length > 0 && (
                <p className="text-[11px] text-slate-400">
                  Fichas de Evidencia contrastadas: {topic.cited_card_ids.length}
                </p>
              )}

              {isCurator && topic.status === "pending" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={busyId === topic.id}
                    onClick={() => void handleReview(topic.id, "approved_context")}
                    className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
                  >
                    Aprobar como contexto
                  </button>
                  <button
                    type="button"
                    disabled={busyId === topic.id}
                    onClick={() => void handleReview(topic.id, "dismissed")}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-rose-500 hover:text-rose-200 disabled:opacity-50"
                  >
                    Descartar
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
