import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

type CandidateStudyResponse = components["schemas"]["CandidateStudyResponse"];
type EvidenceCardDetailResponse = components["schemas"]["EvidenceCardDetailResponse"];
type KnowledgeSearchResponse = components["schemas"]["KnowledgeSearchResponse"];
type ReindexResponse = components["schemas"]["ReindexResponse"];

export const SAMPLE_PAYWALL_CANDIDATE: CandidateStudyResponse = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  doi: "10.1007/s40279-023-01880-x",
  pmid: "37300001",
  pmcid: null,
  source_url: "https://pubmed.ncbi.nlm.nih.gov/37300001/",
  title: "Effects of proximity to failure (RIR) on strength and hypertrophy",
  authors: ["Robinson ZP", "Pelland JC"],
  journal: "Sports Medicine",
  published_year: 2023,
  origin: "manual_upload",
  access_level: "abstract_only_paywall",
  paywall_warning: "Evaluado solo con abstract (texto completo de pago)",
  critical_sheet: {
    block_1_identification:
      "Effects of proximity to failure (RIR) | Robinson ZP | Sports Medicine (2023) | DOI: 10.1007/s40279-023-01880-x",
    block_2_design_and_evidence_level: "Meta-análisis (evaluado solo con abstract).",
    block_3_population_and_protocol: "Población entrenada en fuerza; protocolos 0-4 RIR.",
    block_4_key_findings_and_applicability:
      "Entrenar cerca del fallo (0-2 RIR) favorece hipertrofia; fuerza similar.",
    block_5_limitations_and_conflicts:
      "Evaluado solo con abstract (texto completo de pago). Falta auditoría completa de sesgos.",
    block_6_impact_vs_existing_kb: "Complementa fichas existentes de intensidad y RIR.",
    suggested_evidence_level: "meta_analysis",
    suggested_tags: ["hipertrofia", "rir"],
    key_terms_en: ["RIR", "proximity to failure", "hypertrophy"],
    curated_summary_es:
      "Entrenar a 0-2 RIR maximiza la hipertrofia manteniendo ganancias de fuerza.",
  },
  previous_critical_sheet: null,
  status: "pending",
  rejection_reason: null,
  curator_notes: null,
  pdf_storage_path: null,
  created_at: "2026-11-21T17:00:00Z",
  updated_at: "2026-11-21T17:00:00Z",
};

export const SAMPLE_ACTIVE_CARD: EvidenceCardDetailResponse = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  candidate_study_id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
  doi: "10.1080/02640414.2016.1210197",
  pmid: "27433992",
  source_url: "https://pubmed.ncbi.nlm.nih.gov/27433992/",
  title: "Weekly resistance training volume and muscle hypertrophy (RIR & 1RM)",
  evidence_level: "meta_analysis",
  coverage: "full_text",
  curated_text_es:
    "Realizar 10-20 series semanales por grupo muscular maximiza la hipertrofia en rangos de 0-2 RIR.",
  key_terms_en: ["RIR", "1RM", "weekly sets", "hypertrophy"],
  tags: ["volumen", "hipertrofia"],
  curator_notes: "Referencia base para planificación de Mesociclos.",
  validity_status: "active",
  embedding_model: "fake-embedding-v1",
  created_at: "2026-11-20T12:00:00Z",
  updated_at: "2026-11-20T12:00:00Z",
  outgoing_relations: [],
  incoming_relations: [],
  updated_by_cards: [],
};

export const SAMPLE_SUPERSEDED_CARD: EvidenceCardDetailResponse = {
  id: "dddddddd-dddd-dddd-dddd-dddddddddddd",
  candidate_study_id: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee",
  doi: "10.1000/old.2008",
  pmid: "18000001",
  source_url: "https://pubmed.ncbi.nlm.nih.gov/18000001/",
  title: "Early low-volume resistance training trial",
  evidence_level: "rct",
  coverage: "full_text",
  curated_text_es: "Estudio antiguo que sugería 3 series semanales como suficientes.",
  key_terms_en: ["weekly sets", "hypertrophy"],
  tags: ["volumen", "hipertrofia"],
  curator_notes: "Superado por meta-análisis recientes.",
  validity_status: "superseded",
  embedding_model: "fake-embedding-v1",
  created_at: "2026-11-10T12:00:00Z",
  updated_at: "2026-11-20T12:00:00Z",
  outgoing_relations: [],
  incoming_relations: [],
  updated_by_cards: [SAMPLE_ACTIVE_CARD],
};

function isCurator(request: Request): boolean {
  return request.headers.get("authorization") === "Bearer tok-dual";
}

export let lastApprovePayload: Record<string, unknown> | null = null;
export let lastFromPdfReceived = false;

export function resetMockKnowledgeState(): void {
  lastApprovePayload = null;
  lastFromPdfReceived = false;
}

export const knowledgeHandlers = [
  http.get("*/api/v1/knowledge/search", ({ request }) => {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") || "").toLowerCase();
    const level = url.searchParams.get("evidence_level");
    const validity = url.searchParams.get("validity_status");

    const allCards = [SAMPLE_ACTIVE_CARD, SAMPLE_SUPERSEDED_CARD];
    const filtered = allCards.filter((card) => {
      if (level && card.evidence_level !== level) return false;
      if (validity && card.validity_status !== validity) return false;
      if (q) {
        const hay = `${card.title} ${card.curated_text_es} ${card.key_terms_en.join(" ")} ${card.tags.join(" ")}`.toLowerCase();
        return hay.includes(q);
      }
      return true;
    });

    const body: KnowledgeSearchResponse = {
      items: filtered.map((card, idx) => ({
        card,
        score: card.validity_status === "active" ? 0.032 : 0.008,
        vector_rank: idx + 1,
        lexical_rank: idx + 1,
        updated_by_cards: card.updated_by_cards,
      })),
      total: filtered.length,
    };
    return HttpResponse.json(body);
  }),

  http.get("*/api/v1/knowledge/cards/:cardId", ({ params }) => {
    if (params.cardId === SAMPLE_ACTIVE_CARD.id) {
      return HttpResponse.json(SAMPLE_ACTIVE_CARD);
    }
    if (params.cardId === SAMPLE_SUPERSEDED_CARD.id) {
      return HttpResponse.json(SAMPLE_SUPERSEDED_CARD);
    }
    return HttpResponse.json(
      { detail: "No se encontró la Ficha de Evidencia solicitada." },
      { status: 404 },
    );
  }),

  http.get("*/api/v1/curator/candidates", ({ request }) => {
    if (!isCurator(request)) {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    return HttpResponse.json({ items: [SAMPLE_PAYWALL_CANDIDATE] });
  }),

  http.post("*/api/v1/curator/candidates/from-doi", async ({ request }) => {
    if (!isCurator(request)) {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    const payload = (await request.json()) as { doi_or_url: string; allow_reopen?: boolean };
    if (payload.doi_or_url.includes("rejected") && !payload.allow_reopen) {
      return HttpResponse.json(
        {
          detail: {
            code: "previously_rejected",
            message: "Este estudio ya fue rechazado anteriormente.",
            prior_candidate_id: "ffffffff-ffff-ffff-ffff-ffffffffffff",
            prior_title: "Uncontrolled pilot study",
            prior_rejection_reason: "Muestra mínima sin grupo control.",
          },
        },
        { status: 409 },
      );
    }
    return HttpResponse.json(
      {
        ...SAMPLE_PAYWALL_CANDIDATE,
        id: "99999999-9999-9999-9999-999999999999",
        doi: payload.doi_or_url,
        title: `Estudio propuesto: ${payload.doi_or_url}`,
      },
      { status: 201 },
    );
  }),

  http.post("*/api/v1/curator/candidates/from-pdf", async ({ request }) => {
    if (!isCurator(request)) {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    lastFromPdfReceived = true;
    return HttpResponse.json(
      {
        ...SAMPLE_PAYWALL_CANDIDATE,
        id: "88888888-8888-8888-8888-888888888888",
        access_level: "full_text_uploaded_pdf",
        paywall_warning: null,
        title: "Estudio propuesto desde PDF",
      },
      { status: 201 },
    );
  }),

  http.post("*/api/v1/curator/candidates/:candidateId/upload-pdf", async ({ request }) => {
    if (!isCurator(request)) {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    return HttpResponse.json({
      ...SAMPLE_PAYWALL_CANDIDATE,
      access_level: "full_text_uploaded_pdf",
      paywall_warning: null,
      pdf_storage_path: "curator/candidates/full_text.pdf",
      previous_critical_sheet: SAMPLE_PAYWALL_CANDIDATE.critical_sheet,
      critical_sheet: {
        ...SAMPLE_PAYWALL_CANDIDATE.critical_sheet,
        block_3_population_and_protocol: "Texto completo analizado: n=120 sujetos entrenados.",
      },
    });
  }),

  http.post("*/api/v1/curator/candidates/:candidateId/approve", async ({ request }) => {
    if (!isCurator(request)) {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    lastApprovePayload = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      {
        ...SAMPLE_ACTIVE_CARD,
        id: "77777777-7777-7777-7777-777777777777",
        title: SAMPLE_PAYWALL_CANDIDATE.title,
      },
      { status: 201 },
    );
  }),

  http.post("*/api/v1/curator/candidates/:candidateId/reject", async ({ request }) => {
    if (!isCurator(request)) {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    const payload = (await request.json()) as { rejection_reason: string };
    return HttpResponse.json({
      ...SAMPLE_PAYWALL_CANDIDATE,
      status: "rejected",
      rejection_reason: payload.rejection_reason,
    });
  }),

  http.post("*/api/v1/curator/reindex", ({ request }) => {
    if (!isCurator(request)) {
      return HttpResponse.json(
        { detail: "Se requiere el rol de Curador para realizar esta acción." },
        { status: 403 },
      );
    }
    const body: ReindexResponse = {
      reindexed_count: 2,
      skipped_count: 0,
      embedding_model: "fake-embedding-v2",
    };
    return HttpResponse.json(body);
  }),
];
