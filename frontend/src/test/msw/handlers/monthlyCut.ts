import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

type MonthlyCutRun = components["schemas"]["MonthlyCutRunResponse"];
type TrendingTopic = components["schemas"]["TrendingTopicResponse"];

let mockRuns: MonthlyCutRun[] = [
  {
    id: "run-paused-1",
    run_type: "scheduled",
    date_from: "2026-01-01",
    date_to: "2026-01-31",
    query_override: null,
    max_candidates: 12,
    sources: ["PubMed", "Europe PMC"],
    status: "paused_rate_limit",
    collected_count: 18,
    filtered_count: 4,
    analyzed_count: 2,
    checkpoint_next_index: 2,
    checkpoint_queue_size: 4,
    pause_reason: "HTTP 429: cuota gratuita alcanzada temporalmente",
    error_message: null,
    started_at: "2026-02-01T06:00:00Z",
    finished_at: null,
  },
];

let mockTopics: TrendingTopic[] = [
  {
    id: "topic-approved-1",
    monthly_cut_run_id: "run-paused-1",
    title: "Parciales en estiramiento vs ROM completo en hipertrofia",
    summary: "Debate viral en redes sobre si las parciales en estiramiento sustituyen al ROM completo.",
    critical_evaluation:
      "La evidencia aprobada muestra utilidad complementaria de la tensión en estiramiento, sin invalidar el ROM completo.",
    cited_card_ids: ["card-1"],
    status: "approved_context",
    created_at: "2026-02-01T06:05:00Z",
  },
  {
    id: "topic-pending-2",
    monthly_cut_run_id: "run-paused-1",
    title: "¿La creatina HCL supera al monohidrato de creatina?",
    summary: "Afirmación comercial frecuente sobre superioridad de la creatina HCL.",
    critical_evaluation:
      "No existe evidencia primaria superior al monohidrato de creatina (3-5 g/día) en la Base de Conocimiento.",
    cited_card_ids: ["card-1"],
    status: "pending",
    created_at: "2026-02-01T06:06:00Z",
  },
];

let seedLoaded = false;

export function resetMonthlyCutFixtures() {
  seedLoaded = false;
  mockRuns = [
    {
      id: "run-paused-1",
      run_type: "scheduled",
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      query_override: null,
      max_candidates: 12,
      sources: ["PubMed", "Europe PMC"],
      status: "paused_rate_limit",
      collected_count: 18,
      filtered_count: 4,
      analyzed_count: 2,
      checkpoint_next_index: 2,
      checkpoint_queue_size: 4,
      pause_reason: "HTTP 429: cuota gratuita alcanzada temporalmente",
      error_message: null,
      started_at: "2026-02-01T06:00:00Z",
      finished_at: null,
    },
  ];
  mockTopics = [
    {
      id: "topic-approved-1",
      monthly_cut_run_id: "run-paused-1",
      title: "Parciales en estiramiento vs ROM completo en hipertrofia",
      summary:
        "Debate viral en redes sobre si las parciales en estiramiento sustituyen al ROM completo.",
      critical_evaluation:
        "La evidencia aprobada muestra utilidad complementaria de la tensión en estiramiento, sin invalidar el ROM completo.",
      cited_card_ids: ["card-1"],
      status: "approved_context",
      created_at: "2026-02-01T06:05:00Z",
    },
    {
      id: "topic-pending-2",
      monthly_cut_run_id: "run-paused-1",
      title: "¿La creatina HCL supera al monohidrato de creatina?",
      summary: "Afirmación comercial frecuente sobre superioridad de la creatina HCL.",
      critical_evaluation:
        "No existe evidencia primaria superior al monohidrato de creatina (3-5 g/día) en la Base de Conocimiento.",
      cited_card_ids: ["card-1"],
      status: "pending",
      created_at: "2026-02-01T06:06:00Z",
    },
  ];
}

export const monthlyCutHandlers = [
  http.get("*/api/v1/knowledge/trending-topics", () => {
    return HttpResponse.json({
      items: mockTopics.filter((t) => t.status === "approved_context"),
    });
  }),

  http.get("*/api/v1/curator/monthly-cuts", () => {
    return HttpResponse.json({ items: mockRuns });
  }),

  http.post("*/api/v1/curator/monthly-cuts", async ({ request }) => {
    const body = (await request.json()) as components["schemas"]["TriggerMonthlyCutRequest"];
    const created: MonthlyCutRun = {
      id: `run-manual-${mockRuns.length + 1}`,
      run_type: "manual",
      date_from: body.date_from ?? null,
      date_to: body.date_to ?? null,
      query_override: body.query_override ?? null,
      max_candidates: body.max_candidates ?? 12,
      sources: ["PubMed", "Europe PMC", "SportRxiv"],
      status: "completed",
      collected_count: 14,
      filtered_count: 3,
      analyzed_count: 3,
      checkpoint_next_index: 3,
      checkpoint_queue_size: 3,
      pause_reason: null,
      error_message: null,
      started_at: "2026-02-15T10:00:00Z",
      finished_at: "2026-02-15T10:02:00Z",
    };
    mockRuns = [created, ...mockRuns];
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post("*/api/v1/curator/monthly-cuts/:runId/resume", ({ params }) => {
    const runId = String(params.runId);
    let updated: MonthlyCutRun | undefined;
    mockRuns = mockRuns.map((run) => {
      if (run.id !== runId) return run;
      updated = {
        ...run,
        status: "completed",
        analyzed_count: run.filtered_count,
        checkpoint_next_index: run.checkpoint_queue_size,
        pause_reason: null,
        finished_at: "2026-02-15T10:05:00Z",
      };
      return updated;
    });
    if (!updated) {
      return HttpResponse.json({ detail: "Ejecución no encontrada." }, { status: 404 });
    }
    return HttpResponse.json(updated);
  }),

  http.post("*/api/v1/curator/seed-batch", () => {
    const created_count = seedLoaded ? 0 : 16;
    const skipped_count = seedLoaded ? 16 : 0;
    seedLoaded = true;
    return HttpResponse.json(
      {
        run_id: "run-seed-1",
        total_in_catalog: 16,
        created_count,
        skipped_count,
      },
      { status: 201 },
    );
  }),

  http.get("*/api/v1/curator/trending-topics", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const items = status ? mockTopics.filter((t) => t.status === status) : mockTopics;
    return HttpResponse.json({ items });
  }),

  http.post("*/api/v1/curator/trending-topics/:topicId/review", async ({ params, request }) => {
    const topicId = String(params.topicId);
    const body = (await request.json()) as components["schemas"]["ReviewTrendingTopicRequest"];
    let updated: TrendingTopic | undefined;
    mockTopics = mockTopics.map((topic) => {
      if (topic.id !== topicId) return topic;
      updated = { ...topic, status: body.decision };
      return updated;
    });
    if (!updated) {
      return HttpResponse.json({ detail: "Tema no encontrado." }, { status: 404 });
    }
    return HttpResponse.json(updated);
  }),
];
