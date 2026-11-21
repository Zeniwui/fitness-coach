import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { setAuthToken } from "../../api/client";

describe("Ciencia — Base de Conocimiento y Bandeja del Curador (#4)", () => {
  it("allows Athlete to run hybrid search on approved Knowledge Base and hides Curator inbox", async () => {
    setAuthToken("tok-athlete");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    // Approved EvidenceCard is shown and superseded card displays its updating reference
    expect(
      await screen.findByRole("heading", {
        name: /weekly resistance training volume and muscle hypertrophy/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/actualizada por/i)).toBeInTheDocument();

    // Curator-only controls are hidden for Athlete
    expect(screen.queryByRole("tab", { name: /bandeja del curador/i })).not.toBeInTheDocument();
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
    setAuthToken("tok-dual");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    // Switch to Bandeja del Curador tab
    const inboxTab = await screen.findByRole("tab", { name: /bandeja del curador/i });
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
});
