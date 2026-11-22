import { afterEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { seedSupabaseSession } from "../../test/authHelpers";
import { resetMonthlyCutFixtures } from "../../test/msw/handlers/monthlyCut";

describe("Ciencia — Corte Mensual, Lote Semilla y Temas de Actualidad (#5)", () => {
  afterEach(() => {
    resetMonthlyCutFixtures();
  });

  it("shows Athlete Temas de Actualidad separately from Base de Conocimiento and hides Curator controls", async () => {
    seedSupabaseSession("tok-athlete");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    // Athlete sees Base de Conocimiento & Temas de Actualidad tabs, never Corte Mensual or Bandeja del Curador
    const trendingTab = await screen.findByRole("tab", { name: /temas de actualidad/i });
    expect(screen.queryByRole("tab", { name: /corte mensual/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /bandeja del curador/i })).not.toBeInTheDocument();

    await user.click(trendingTab);

    // Approved Tema de Actualidad is shown with explicit separation notice; pending topic is hidden from Athlete
    expect(
      await screen.findByText(/separados de la evidencia científica primaria/i),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", {
        name: /parciales en estiramiento vs rom completo/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/¿la creatina hcl supera al monohidrato/i),
    ).not.toBeInTheDocument();
  });

  it("allows Curator to view/resume paused Corte Mensual, trigger manual run, load seed batch, and review Temas de Actualidad", async () => {
    seedSupabaseSession("tok-dual");
    const user = userEvent.setup();
    render(<App initialEntries={["/science"]} />);

    // Switch to Corte Mensual tab
    const monthlyCutTab = await screen.findByRole("tab", { name: /corte mensual/i });
    await user.click(monthlyCutTab);

    // Paused run with checkpoint & HTTP 429 pause reason is visible
    expect(await screen.findByText(/pausado por cuota/i)).toBeInTheDocument();
    expect(screen.getByText(/cuota gratuita alcanzada/i)).toBeInTheDocument();

    // Resume from checkpoint transitions run to completed
    await user.click(screen.getByRole("button", { name: /reanudar desde último punto/i }));
    expect(await screen.findByText(/corte reanudado y completado/i)).toBeInTheDocument();

    // Load seed batch idempotently
    await user.click(screen.getByRole("button", { name: /cargar lote semilla/i }));
    expect(
      await screen.findByText(/16 estudios fundacionales añadidos/i),
    ).toBeInTheDocument();

    // Trigger a manual Corte Mensual
    const queryInput = screen.getByLabelText(/consulta científica opcional/i);
    await user.type(queryInput, "hypertrophy RIR");
    await user.click(screen.getByRole("button", { name: /ejecutar corte mensual/i }));
    expect(await screen.findByText(/corte mensual ejecutado/i)).toBeInTheDocument();

    // Switch to Temas de Actualidad and approve pending topic as context
    await user.click(screen.getByRole("tab", { name: /temas de actualidad/i }));
    expect(
      await screen.findByRole("heading", {
        name: /¿la creatina hcl supera al monohidrato/i,
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /aprobar como contexto/i }));
    expect(
      await screen.findByText(/tema de actualidad aprobado como contexto/i),
    ).toBeInTheDocument();
  });
});
