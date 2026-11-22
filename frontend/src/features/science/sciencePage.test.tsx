import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { seedSupabaseSession } from "../../test/authHelpers";
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
});
