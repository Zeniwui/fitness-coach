import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";

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
      <Surface variant="warning" padded="sm" className="text-xs">
        <h2 className="font-semibold text-warning-text">
          Temas de Actualidad — Bloque independiente
        </h2>
        <p className="mt-1 leading-relaxed text-ink-muted">
          Tendencias, debates y afirmaciones recientes del fitness contrastados frente a la Base de
          Conocimiento. Se mantienen estrictamente separados de la evidencia científica primaria
          (Fichas de Evidencia).
        </p>
      </Surface>

      {feedback && <AlertBanner tone="success">{feedback}</AlertBanner>}
      {error && <AlertBanner tone="error">{error}</AlertBanner>}

      {loading ? (
        <p role="status" className="text-sm text-ink-muted">
          Cargando Temas de Actualidad…
        </p>
      ) : topics.length === 0 ? (
        <Surface variant="inset" padded="md" className="text-xs text-ink-muted">
          No hay Temas de Actualidad disponibles todavía.
        </Surface>
      ) : (
        <ul className="space-y-4">
          {topics.map((topic) => (
            <li
              key={topic.id}
              className="space-y-3 rounded-panel border border-line bg-surface p-5 shadow-panel"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="heading-section text-lg text-ink">{topic.title}</h3>
                <Badge tone={topic.status === "approved_context" ? "success" : "neutral"}>
                  {TOPIC_STATUS_LABELS[topic.status]}
                </Badge>
              </div>

              <p className="max-w-[68ch] text-sm leading-relaxed text-ink-muted">{topic.summary}</p>

              <div className="max-w-[68ch] rounded-control border border-line bg-surface-muted/60 p-3.5 text-xs">
                <p className="mb-1 font-semibold text-accent-text">
                  Contraste crítico frente a la Base de Conocimiento
                </p>
                <p className="leading-relaxed text-ink">{topic.critical_evaluation}</p>
              </div>

              {topic.cited_card_ids.length > 0 && (
                <p className="text-xs text-ink-muted tabular-nums">
                  Fichas de Evidencia contrastadas: {topic.cited_card_ids.length}
                </p>
              )}

              {isCurator && topic.status === "pending" && (
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    size="sm"
                    disabled={busyId === topic.id}
                    onClick={() => void handleReview(topic.id, "approved_context")}
                  >
                    Aprobar como contexto
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    disabled={busyId === topic.id}
                    onClick={() => void handleReview(topic.id, "dismissed")}
                  >
                    Descartar
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
