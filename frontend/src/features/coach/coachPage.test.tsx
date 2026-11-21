import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { setAuthToken } from "../../api/client";
import { getMockPromotedPayloads, resetMockCoachState } from "../../test/msw/handlers/coach";

describe("Coach Chat SSE, Citations, Live Search Quarantine & Profile Proposals (#6)", () => {
  beforeEach(() => {
    resetMockCoachState();
    setAuthToken("tok-athlete");
  });

  it("streams Coach response over SSE and renders clickable EvidenceCard citation chips", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const input = await screen.findByLabelText(/mensaje para el coach/i);
    await user.type(input, "¿Qué dosis de creatina recomiendas?");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(
      await screen.findByText(/la creatina monohidrato a 3-5 g\/día mejora fuerza/i),
    ).toBeInTheDocument();

    const citationChip = await screen.findByRole("button", {
      name: /ISSN Position Stand: Creatine Supplementation/i,
    });
    expect(citationChip).toHaveTextContent(/position_stand|posicionamiento/i);
  });

  it("shows quarantined live-search banner and promotes hit in 1 click to CandidateStudy", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const input = await screen.findByLabelText(/mensaje para el coach/i);
    await user.click(screen.getByLabelText(/búsqueda en vivo/i));
    await user.type(input, "Busca un estudio reciente sobre parciales");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(
      await screen.findByText(/fuente externa aún no verificada en Base de Conocimiento/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Lengthened partials vs full ROM \(2025 preprint\)/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /enviar a estudios candidatos/i }));

    expect(await screen.findByText(/enviado como estudio candidato/i)).toBeInTheDocument();
    expect(getMockPromotedPayloads()).toHaveLength(1);
    expect(getMockPromotedPayloads()[0]?.doi).toBe("10.51224/srxiv.999");
  });

  it("renders inline Living Profile update proposal card and lets Athlete accept or dismiss", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const input = await screen.findByLabelText(/mensaje para el coach/i);
    await user.type(input, "Ahora solo puedo entrenar 3 días y me duele el hombro");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(
      await screen.findByText(/propuesta de actualización del perfil vivo/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/registrar molestia\/lesión activa en hombro/i),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /aceptar actualización/i }));
    expect(await screen.findByText(/perfil vivo actualizado/i)).toBeInTheDocument();
  });
});
