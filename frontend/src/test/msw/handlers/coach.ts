import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

type ConversationResponse = components["schemas"]["ConversationResponse"];
type ChatMessageResponse = components["schemas"]["ChatMessageResponse"];
type ProfileProposalResponse = components["schemas"]["ProfileProposalResponse"];
type PromoteLiveSearchRequest = components["schemas"]["PromoteLiveSearchRequest"];

const QUARANTINE_LABEL = "fuente externa aún no verificada en Base de Conocimiento";

let convCounter = 1;
let msgCounter = 1;
let propCounter = 1;

let mockConversations: ConversationResponse[] = [];
let mockMessagesByConv: Record<string, ChatMessageResponse[]> = {};
let mockProposals: ProfileProposalResponse[] = [];
let promotedPayloads: PromoteLiveSearchRequest[] = [];

export function resetMockCoachState(options?: {
  conversations?: ConversationResponse[];
  messagesByConv?: Record<string, ChatMessageResponse[]>;
}): void {
  convCounter = 1;
  msgCounter = 1;
  propCounter = 1;
  mockConversations = options?.conversations
    ? structuredClone(options.conversations)
    : [
        {
          id: "aaaa0000-0000-0000-0000-000000000001",
          title: "Plan de hipertrofia",
          created_at: "2026-11-21T10:00:00Z",
          updated_at: "2026-11-21T10:00:00Z",
        },
      ];
  mockMessagesByConv = options?.messagesByConv
    ? structuredClone(options.messagesByConv)
    : {
        "aaaa0000-0000-0000-0000-000000000001": [],
      };
  mockProposals = [];
  promotedPayloads = [];
}

export function getMockPromotedPayloads(): PromoteLiveSearchRequest[] {
  return [...promotedPayloads];
}

resetMockCoachState();

function formatSse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export const coachHandlers = [
  http.get("*/api/v1/coach/conversations", () => {
    return HttpResponse.json(mockConversations);
  }),

  http.post("*/api/v1/coach/conversations", async ({ request }) => {
    const body = (await request.json()) as { title?: string | null };
    convCounter += 1;
    const conv: ConversationResponse = {
      id: `aaaa0000-0000-0000-0000-00000000000${convCounter}`,
      title: body.title?.trim() || "Nueva conversación",
      created_at: "2026-11-21T11:00:00Z",
      updated_at: "2026-11-21T11:00:00Z",
    };
    mockConversations = [conv, ...mockConversations];
    mockMessagesByConv[conv.id] = [];
    return HttpResponse.json(conv, { status: 201 });
  }),

  http.patch("*/api/v1/coach/conversations/:id", async ({ params, request }) => {
    const id = String(params.id);
    const idx = mockConversations.findIndex((c) => c.id === id);
    if (idx === -1) {
      return HttpResponse.json({ detail: "Conversación no encontrada." }, { status: 404 });
    }
    const body = (await request.json()) as { title?: string };
    const trimmed = body.title?.trim() ?? "";
    if (!trimmed || trimmed.length > 200) {
      return HttpResponse.json(
        { detail: "El título de la conversación debe tener entre 1 y 200 caracteres." },
        { status: 422 },
      );
    }
    const updated: ConversationResponse = {
      ...mockConversations[idx],
      title: trimmed,
      updated_at: "2026-11-21T12:30:00Z",
    };
    mockConversations[idx] = updated;
    return HttpResponse.json(updated);
  }),

  http.delete("*/api/v1/coach/conversations/:id", ({ params }) => {
    const id = String(params.id);
    const before = mockConversations.length;
    mockConversations = mockConversations.filter((c) => c.id !== id);
    if (mockConversations.length === before) {
      return HttpResponse.json({ detail: "Conversación no encontrada." }, { status: 404 });
    }
    delete mockMessagesByConv[id];
    return new HttpResponse(null, { status: 204 });
  }),

  http.get("*/api/v1/coach/conversations/:id/messages", ({ params }) => {
    const id = String(params.id);
    return HttpResponse.json(mockMessagesByConv[id] ?? []);
  }),

  http.post("*/api/v1/coach/conversations/:id/messages", async ({ params, request }) => {
    const id = String(params.id);
    const body = (await request.json()) as {
      content: string;
      enable_live_search?: boolean;
      attachment_ids?: string[];
    };
    const text = body.content.trim();
    const lowered = text.toLowerCase();
    const attachmentIds = body.attachment_ids ?? [];

    msgCounter += 1;
    const userMsg: ChatMessageResponse = {
      id: `bbbb0000-0000-0000-0000-0000000000${msgCounter}`,
      conversation_id: id,
      role: "user",
      content: text,
      citations: [],
      live_search_results: [],
      attachments: attachmentIds.map((attId) => ({
        id: attId,
        message_id: `bbbb0000-0000-0000-0000-0000000000${msgCounter}`,
        media_type: "image",
        mime_type: "image/png",
        original_filename: "comida.png",
        size_bytes: 128,
        category: "meal",
        created_at: "2026-11-21T12:00:00Z",
      })),
      used_general_knowledge: false,
      boundary_triggered: "none",
      created_at: "2026-11-21T12:00:00Z",
    };

    const chunks: string[] = [];
    let replyText = "Prioriza progresión de cargas y volumen semanal controlado.";
    let citations: ChatMessageResponse["citations"] = [];
    let liveResults: ChatMessageResponse["live_search_results"] = [];
    let usedGeneralKnowledge = true;
    let emittedProposal: ProfileProposalResponse | null = null;

    if (attachmentIds.length > 0) {
      replyText =
        "Estimación aproximada del plato: 500-620 kcal (38-48 g proteína). Al no estar pesado existe margen de incertidumbre.";
    }

    if (lowered.includes("creatina")) {
      replyText = "La creatina monohidrato a 3-5 g/día mejora fuerza y masa muscular.";
      usedGeneralKnowledge = false;
      citations = [
        {
          card_id: "card-0000-0000-0000-000000000001",
          title: "ISSN Position Stand: Creatine Supplementation",
          evidence_level: "position_stand",
          validity_status: "active",
          doi: "10.1186/s12970-021-00412-w",
          pmid: "34567890",
          source_url: "https://pubmed.ncbi.nlm.nih.gov/34567890/",
          superseded_by_card_id: null,
          superseded_by_title: null,
        },
      ];
    }

    if (body.enable_live_search || lowered.includes("estudio reciente")) {
      replyText = "Encontré un estudio externo reciente en cuarentena sobre parciales.";
      liveResults = [
        {
          title: "Lengthened partials vs full ROM (2025 preprint)",
          url: "https://sportrxiv.org/preprint/999",
          snippet: "Resultados preliminares sobre rango parcial en estiramiento.",
          doi: "10.51224/srxiv.999",
          pmid: null,
          published_year: 2025,
          quarantine_label: QUARANTINE_LABEL,
        },
      ];
    }

    if (lowered.includes("hombro") || lowered.includes("3 días")) {
      propCounter += 1;
      emittedProposal = {
        id: `cccc0000-0000-0000-0000-00000000000${propCounter}`,
        message_id: null,
        proposed_changes: {
          training_days_per_week: 3,
          new_injury: {
            body_part: "Hombro",
            description: text,
            severity: "moderate",
          },
        },
        summary_es:
          "Registrar molestia/lesión activa en Hombro; Actualizar disponibilidad a 3 días/semana.",
        status: "proposed",
        created_at: "2026-11-21T12:00:01Z",
        resolved_at: null,
      };
      mockProposals = [emittedProposal, ...mockProposals];
    }

    for (const word of replyText.split(" ")) {
      chunks.push(formatSse("token", { delta: `${word} ` }));
    }
    chunks.push(
      formatSse("citations", {
        citations,
        used_general_knowledge: usedGeneralKnowledge,
        boundary_triggered: "none",
      }),
    );
    if (liveResults.length > 0) {
      chunks.push(
        formatSse("live_search_quarantine", {
          quarantine_label: QUARANTINE_LABEL,
          results: liveResults,
        }),
      );
    }
    if (emittedProposal) {
      chunks.push(formatSse("profile_proposal", { proposal: emittedProposal }));
    }

    msgCounter += 1;
    const assistantMsg: ChatMessageResponse = {
      id: `bbbb0000-0000-0000-0000-0000000000${msgCounter}`,
      conversation_id: id,
      role: "assistant",
      content: replyText,
      citations,
      live_search_results: liveResults,
      used_general_knowledge: usedGeneralKnowledge,
      boundary_triggered: "none",
      created_at: "2026-11-21T12:00:01Z",
    };

    mockMessagesByConv[id] = [...(mockMessagesByConv[id] ?? []), userMsg, assistantMsg];
    chunks.push(formatSse("done", { message: assistantMsg }));

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    return new HttpResponse(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream; charset=utf-8" },
    });
  }),

  http.post("*/api/v1/coach/live-search/promote", async ({ request }) => {
    const payload = (await request.json()) as PromoteLiveSearchRequest;
    promotedPayloads.push(payload);
    return HttpResponse.json(
      {
        candidate_id: "dddd0000-0000-0000-0000-000000000001",
        title: payload.result_url,
        origin: "live_search_promoted",
        status: "pending",
        access_level: "abstract_only_paywall",
      },
      { status: 201 },
    );
  }),

  http.get("*/api/v1/profile/proposals", () => {
    return HttpResponse.json(mockProposals);
  }),

  http.post("*/api/v1/profile/proposals/:id/accept", ({ params }) => {
    const id = String(params.id);
    const found = mockProposals.find((p) => p.id === id);
    if (!found) {
      return HttpResponse.json({ detail: "No encontrada" }, { status: 404 });
    }
    found.status = "accepted";
    found.resolved_at = "2026-11-21T12:05:00Z";
    return HttpResponse.json(found);
  }),

  http.post("*/api/v1/profile/proposals/:id/dismiss", ({ params }) => {
    const id = String(params.id);
    const found = mockProposals.find((p) => p.id === id);
    if (!found) {
      return HttpResponse.json({ detail: "No encontrada" }, { status: 404 });
    }
    found.status = "dismissed";
    found.resolved_at = "2026-11-21T12:05:00Z";
    return HttpResponse.json(found);
  }),
];
