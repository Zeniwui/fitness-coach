import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { seedSupabaseSession } from "../../test/authHelpers";
import { resetMockProfileState } from "../../test/msw/handlers/profile";

describe("Living Profile (Perfil Vivo) & Injuries UI (#3)", () => {
  beforeEach(() => {
    resetMockProfileState();
    seedSupabaseSession("tok-athlete");
  });

  it("displays active Coach context banner and saves structured Living Profile fields", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/profile"]} />);

    const banner = await screen.findByRole("region", {
      name: /contexto activo para el coach/i,
    });
    expect(banner).toHaveTextContent(/natural/i);
    expect(banner).toHaveTextContent(/sin lesiones activas/i);

    await user.type(screen.getByLabelText(/^edad/i), "30");
    await user.selectOptions(screen.getByLabelText(/sexo/i), "male");
    await user.type(screen.getByLabelText(/altura/i), "180");
    await user.type(screen.getByLabelText(/peso base/i), "82.5");
    await user.selectOptions(screen.getByLabelText(/nivel de experiencia/i), "intermediate");
    await user.selectOptions(screen.getByLabelText(/objetivo principal/i), "hypertrophy");
    await user.type(screen.getByLabelText(/días por semana/i), "4");
    await user.type(screen.getByLabelText(/duración por sesión/i), "70");
    await user.type(screen.getByLabelText(/equipamiento disponible/i), "Barra, Mancuernas, Poleas");
    await user.type(screen.getByLabelText(/alergias o intolerancias/i), "Lactosa");
    await user.type(screen.getByLabelText(/preferencias alimentarias/i), "Alta proteína, 4 comidas");

    await user.click(screen.getByRole("button", { name: /guardar perfil vivo/i }));

    expect(await screen.findByText(/perfil vivo guardado correctamente/i)).toBeInTheDocument();
    expect(banner).toHaveTextContent(/hipertrofia/i);
    expect(banner).toHaveTextContent(/82\.5 kg/i);
    expect(banner).toHaveTextContent(/4 días\/sem/i);
    expect(banner).toHaveTextContent(/lactosa/i);
  });

  it("shows clear Spanish validation errors when profile values are out of range", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/profile"]} />);

    await screen.findByRole("region", { name: /contexto activo para el coach/i });

    await user.type(screen.getByLabelText(/^edad/i), "11");
    await user.type(screen.getByLabelText(/días por semana/i), "9");
    await user.click(screen.getByRole("button", { name: /guardar perfil vivo/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /la edad debe estar entre 14 y 100 años/i,
    );
  });

  it("adds, resolves in 1 tap, and deletes injuries updating active context immediately", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/profile"]} />);

    const banner = await screen.findByRole("region", {
      name: /contexto activo para el coach/i,
    });

    // Add a new injury/restriction
    await user.type(screen.getByLabelText(/zona corporal/i), "Hombro derecho");
    await user.type(
      screen.getByLabelText(/descripción de la lesión/i),
      "Molestia en press inclinado pesado",
    );
    await user.selectOptions(screen.getByLabelText(/gravedad/i), "moderate");
    await user.click(screen.getByRole("button", { name: /añadir restricción/i }));

    expect(await within(banner).findByText(/1 restricción activa/i)).toBeInTheDocument();
    expect(banner).toHaveTextContent(/hombro derecho/i);
    expect(screen.getAllByText(/hombro derecho/i).length).toBeGreaterThanOrEqual(2);

    // Edit injury description
    await user.click(screen.getByRole("button", { name: /^editar$/i }));
    const editDesc = screen.getByLabelText(/editar descripción/i);
    await user.clear(editDesc);
    await user.type(editDesc, "Molestia solo con mancuernas pesadas");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(await within(banner).findByText(/molestia solo con mancuernas pesadas/i)).toBeInTheDocument();

    // Resolve in 1 tap with optional note -> immediately removed from active context
    await user.type(
      screen.getByLabelText(/nota de resolución para hombro derecho/i),
      "Recuperado tras 2 semanas",
    );
    await user.click(screen.getByRole("button", { name: /marcar resuelta/i }));
    expect(await screen.findByText(/recuperado tras 2 semanas/i)).toBeInTheDocument();
    expect(within(banner).getByText(/sin lesiones activas/i)).toBeInTheDocument();

    // Reopen -> back in active context
    await user.click(screen.getByRole("button", { name: /reactivar/i }));
    expect(await within(banner).findByText(/1 restricción activa/i)).toBeInTheDocument();

    // Delete -> requires explicit confirmation, then removed completely
    await user.click(screen.getByRole("button", { name: /^eliminar$/i }));
    await user.click(screen.getByRole("button", { name: /confirmar eliminación/i }));
    expect(await within(banner).findByText(/sin lesiones activas/i)).toBeInTheDocument();
    expect(screen.queryByText(/molestia solo con mancuernas pesadas/i)).not.toBeInTheDocument();
  });

  it("opens accessible inline contextual help for natural vs PEDs training approach", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/profile"]} />);

    const helpBtn = await screen.findByRole("button", {
      name: /ayuda sobre enfoque natural y peds/i,
    });
    expect(helpBtn).toHaveAttribute("aria-expanded", "false");

    await user.click(helpBtn);
    expect(helpBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/farmacología ni protocolos de sustancias/i)).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(helpBtn).toHaveAttribute("aria-expanded", "false");
  });
});
