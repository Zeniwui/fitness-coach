import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { App } from "../../app/App";
import { seedSupabaseSession } from "../../test/authHelpers";
import { server } from "../../test/msw/server";
import {
  SAMPLE_ACTIVE_CARD,
  lastApprovePayload,
  lastFromPdfReceived,
  resetMockKnowledgeState,
} from "../../test/msw/handlers/knowledge";

describe("Ciencia — Base de Conocimiento y Bandeja del Curador (#4)", () => {
  beforeEach(() => {
    resetMockKnowledgeState();
  });
  it("allows Athlete to run hybrid search on approved Knowledge Base and hides Curator inbox", async () => {
    seedSupabaseSession("tok-athlete");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    // Approved EvidenceCard is shown and superseded card displays its updating reference
    expect(
      await screen.findByRole("heading", {
        name: /weekly resistance training volume and muscle hypertrophy/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/actualizada por/i)).toBeInTheDocument();

    // Curator-only controls are hidden for Athlete (exact 2 scientific tabs)
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    expect(screen.queryByRole("tab", { name: /bandeja del curador/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /invitaciones/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /re-indexar/i })).not.toBeInTheDocument();

    // Exact acronym search (RIR)
    const searchInput = screen.getByLabelText(/buscar fichas de evidencia/i);
    await user.type(searchInput, "RIR");
    await user.click(screen.getByRole("button", { name: /buscar/i }));

    expect(
      await screen.findByRole("heading", {
        name: /weekly resistance training volume and muscle hypertrophy/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/early low-volume resistance training trial/i)).not.toBeInTheDocument();
  });

  it("shows Curator Inbox with 6-block critical sheet, paywall warning, PDF upload, reject/approve & reindex", async () => {
    seedSupabaseSession("tok-dual");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    // Switch to Bandeja del Curador tab (Curator sees exactly 4 scientific tabs, never Invitaciones)
    const inboxTab = await screen.findByRole("tab", { name: /bandeja del curador/i });
    expect(screen.getAllByRole("tab")).toHaveLength(4);
    expect(screen.queryByRole("tab", { name: /invitaciones/i })).not.toBeInTheDocument();
    await user.click(inboxTab);

    // Prominent paywall warning label & 6-block critical sheet visible
    const paywallWarnings = await screen.findAllByText(
      /evaluado solo con abstract \(texto completo de pago\)/i,
    );
    expect(paywallWarnings.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/1\. identificación y enlace/i)).toBeInTheDocument();
    expect(screen.getByText(/6\. impacto frente a fichas existentes/i)).toBeInTheDocument();

    // Proposing a previously rejected DOI surfaces the prior rejection reason and reopen option
    const doiInput = screen.getByLabelText(/doi o enlace del estudio/i);
    await user.type(doiInput, "10.9999/rejected.2024");
    await user.click(screen.getByRole("button", { name: /proponer por doi/i }));

    expect(await screen.findByText(/muestra mínima sin grupo control/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reabrir estudio/i })).toBeInTheDocument();

    // Approve pending candidate -> creates EvidenceCard
    await user.click(screen.getByRole("button", { name: /aprobar ficha/i }));
    expect(
      await screen.findByText(/ficha de evidencia aprobada e indexada/i),
    ).toBeInTheDocument();

    // Controlled re-indexation action
    await user.click(screen.getByRole("button", { name: /re-indexar base/i }));
    expect(await screen.findByText(/re-indexación completada/i)).toBeInTheDocument();
  });

  it("allows Curator to propose a new CandidateStudy via PDF upload and attach evolution relations on approval", async () => {
    seedSupabaseSession("tok-dual");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    const inboxTab = await screen.findByRole("tab", { name: /bandeja del curador/i });
    await user.click(inboxTab);

    // 1. Propose new CandidateStudy from PDF
    const pdfInput = await screen.findByLabelText(/proponer nuevo estudio desde pdf/i);
    const pdfFile = new File(["%PDF-1.4 fake study"], "study.pdf", { type: "application/pdf" });
    await user.upload(pdfInput, pdfFile);

    expect(await screen.findByText(/estudio propuesto desde pdf/i)).toBeInTheDocument();
    expect(lastFromPdfReceived).toBe(true);

    // 2. Attach an evolution relation (supersedes) targeting an existing approved EvidenceCard
    await user.click(
      await screen.findByRole("button", { name: /vincular con fichas existentes/i }),
    );
    const relationTypeSelect = await screen.findByLabelText(/tipo de relación de evolución/i);
    await user.selectOptions(relationTypeSelect, "supersedes");

    const targetCardSelect = screen.getByLabelText(/ficha de evidencia objetivo/i);
    await user.selectOptions(targetCardSelect, SAMPLE_ACTIVE_CARD.id);

    await user.click(screen.getByRole("button", { name: /añadir relación/i }));

    await user.click(screen.getByRole("button", { name: /aprobar ficha/i }));
    expect(
      await screen.findByText(/ficha de evidencia aprobada e indexada/i),
    ).toBeInTheDocument();

    expect(lastApprovePayload?.relations).toEqual([
      {
        target_card_id: SAMPLE_ACTIVE_CARD.id,
        relation_type: "supersedes",
        rationale: null,
      },
    ]);
  });

  it("collapses advanced filters behind Filtros toggle with active count and one-tap clean refetch reset", async () => {
    seedSupabaseSession("tok-athlete");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    // Both cards load initially
    expect(
      await screen.findByRole("heading", {
        name: /weekly resistance training volume and muscle hypertrophy/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /early low-volume resistance training trial/i }),
    ).toBeInTheDocument();

    // Primary search & quick-query chips are visible; advanced filters are collapsed
    expect(screen.getByLabelText(/buscar fichas de evidencia/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^RIR$/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/etiquetas/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nivel de evidencia/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/vigencia/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).not.toBeInTheDocument();

    const filtersToggle = screen.getByRole("button", { name: /^filtros$/i });
    expect(filtersToggle).toHaveAttribute("aria-expanded", "false");

    // Open advanced filters
    await user.click(filtersToggle);
    expect(filtersToggle).toHaveAttribute("aria-expanded", "true");
    const tagInput = screen.getByLabelText(/etiquetas/i);
    const levelSelect = screen.getByLabelText(/nivel de evidencia/i);
    const validitySelect = screen.getByLabelText(/vigencia/i);

    // Applying evidence level filters immediately and updates count to Filtros (1)
    await user.selectOptions(levelSelect, "meta_analysis");
    expect(screen.getByRole("button", { name: /filtros \(1\)/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /limpiar filtros/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /early low-volume resistance training trial/i }),
    ).not.toBeInTheDocument();

    // Adding validity & tag updates count to Filtros (3)
    await user.selectOptions(validitySelect, "active");
    await user.type(tagInput, "volumen");
    expect(screen.getByRole("button", { name: /filtros \(3\)/i })).toBeInTheDocument();

    // Collapse filters while active: count and one-tap clear remain visible
    await user.click(screen.getByRole("button", { name: /filtros \(3\)/i }));
    expect(screen.queryByLabelText(/nivel de evidencia/i)).not.toBeInTheDocument();
    const clearBtn = screen.getByRole("button", { name: /limpiar filtros/i });
    expect(clearBtn).toBeInTheDocument();

    // One-tap clear triggers a clean refetch restoring all cards without stale filter params
    await user.click(clearBtn);
    expect(
      await screen.findByRole("heading", { name: /early low-volume resistance training trial/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^filtros$/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /limpiar filtros/i })).not.toBeInTheDocument();
  });

  it("exposes accessible inline help explaining evidence levels and scientific validity", async () => {
    seedSupabaseSession("tok-athlete");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    const helpBtn = await screen.findByRole("button", {
      name: /ayuda sobre rigor y actualización científica/i,
    });
    expect(helpBtn).toHaveAttribute("aria-expanded", "false");

    await user.click(helpBtn);
    expect(helpBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/metaanálisis y revisiones sistemáticas/i)).toBeInTheDocument();
    expect(screen.getByText(/vigente, matizada o superada/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(helpBtn).toHaveAttribute("aria-expanded", "false");
  });

  it("renders https:// source_url as clickable link and blocks javascript:/data: links in KB and Curator inbox", async () => {
    seedSupabaseSession("tok-dual");
    server.use(
      http.get("*/api/v1/knowledge/search", () =>
        HttpResponse.json({
          items: [
            {
              card: {
                id: "card-safe",
                title: "Safe KB Card",
                doi: "10.1000/safe",
                pmid: "1",
                source_url: "https://pubmed.ncbi.nlm.nih.gov/1/",
                evidence_level: "rct",
                coverage: "full_text",
                curated_text_es: "Texto seguro",
                key_terms_en: ["safe"],
                tags: ["fuerza"],
                curator_notes: null,
                validity_status: "active",
                embedding_model: "fake",
                created_at: "2026-11-20T00:00:00Z",
                updated_at: "2026-11-20T00:00:00Z",
              },
              score: 0.9,
              vector_rank: 1,
              fts_rank: 1,
              updated_by_cards: [],
            },
            {
              card: {
                id: "card-unsafe",
                title: "Unsafe KB Card",
                doi: "10.1000/unsafe",
                pmid: "2",
                source_url: "javascript:alert(1)",
                evidence_level: "rct",
                coverage: "full_text",
                curated_text_es: "Texto con url insegura",
                key_terms_en: ["unsafe"],
                tags: ["fuerza"],
                curator_notes: null,
                validity_status: "active",
                embedding_model: "fake",
                created_at: "2026-11-20T00:00:00Z",
                updated_at: "2026-11-20T00:00:00Z",
              },
              score: 0.8,
              vector_rank: 2,
              fts_rank: 2,
              updated_by_cards: [],
            },
          ],
          total: 2,
        }),
      ),
      http.get("*/api/v1/curator/candidates", () =>
        HttpResponse.json({
          items: [
            {
              id: "cand-unsafe",
              doi: "10.1000/cand-unsafe",
              pmid: null,
              pmcid: null,
              source_url: "data:text/html,<script>alert(1)</script>",
              title: "Unsafe Candidate",
              authors: ["A"],
              journal: "J",
              published_year: 2025,
              origin: "manual_upload",
              access_level: "abstract_only_paywall",
              status: "pending",
              rejection_reason: null,
              curator_notes: null,
              paywall_warning: null,
              pdf_storage_path: null,
              critical_sheet: {
                block_1_identification: "1",
                block_2_design_and_evidence_level: "2",
                block_3_population_and_protocol: "3",
                block_4_key_findings_and_applicability: "4",
                block_5_limitations_and_conflicts: "5",
                block_6_impact_vs_existing_kb: "6",
                suggested_evidence_level: "rct",
                suggested_tags: [],
                key_terms_en: [],
                curated_summary_es: "",
              },
              previous_critical_sheet: null,
              created_at: "2026-11-20T00:00:00Z",
              updated_at: "2026-11-20T00:00:00Z",
            },
          ],
        }),
      ),
    );

    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    const kbLinks = await screen.findAllByRole("link", { name: /abrir doi \/ pubmed/i });
    expect(kbLinks).toHaveLength(1);
    expect(kbLinks[0]).toHaveAttribute("href", "https://pubmed.ncbi.nlm.nih.gov/1/");
    expect(screen.getByText(/javascript:alert\(1\)/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /bandeja del curador/i }));
    expect(await screen.findByText(/Unsafe Candidate/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /ver fuente original/i })).not.toBeInTheDocument();
    expect(screen.getByText(/data:text\/html/i)).toBeInTheDocument();
  });
});
