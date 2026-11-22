import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { seedSupabaseSession } from "../../test/authHelpers";
import { resetMockTrainingState } from "../../test/msw/handlers/training";

describe("Training (Entrenamiento) UI (#7)", () => {
  beforeEach(() => {
    window.localStorage.removeItem("fc-training-session-draft-v1");
    resetMockTrainingState();
    seedSupabaseSession("tok-athlete");
  });

  it("shows today's planned session from the active Mesociclo with previous recorded marks", async () => {
    render(<App initialEntries={["/training"]} />);

    expect(await screen.findByRole("heading", { level: 1, name: "Entrenamiento" })).toBeInTheDocument();
    expect(await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /sesión planificada: torso a/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Press inclinado mancuernas/i)).toBeInTheDocument();
    // Previous mark from 2026-11-18: 32 kg x 9 @ RIR 1
    expect(screen.getByText(/32 kg × 9/i)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-18/i)).toBeInTheDocument();
  });

  it("drafts a Mesociclo with Coach, edits it, and requires confirmation modal to replace active Mesociclo", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /^Mesociclos$/i }));

    // Generate draft with Coach
    await user.click(screen.getByRole("button", { name: /generar borrador con coach/i }));
    expect(await screen.findByText(/Borrador Coach Hipertrofia/i)).toBeInTheDocument();

    // Edit draft name manually
    const editButtons = screen.getAllByRole("button", { name: /^editar$/i });
    await user.click(editButtons[0]);
    const nameInput = screen.getByLabelText(/nombre del mesociclo/i);
    await user.clear(nameInput);
    await user.type(nameInput, "Mesociclo Especialización Pecho");
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(await screen.findByText(/Mesociclo Especialización Pecho/i)).toBeInTheDocument();

    // Try activating while another is active -> confirmation modal appears
    const activateBtn = screen.getByRole("button", { name: /activar mesociclo/i });
    await user.click(activateBtn);

    const dialog = await screen.findByRole("dialog", {
      name: /confirmar cambio de mesociclo activo/i,
    });
    expect(dialog).toHaveTextContent(/Mesociclo Hipertrofia Torso-Pierna/i);

    await user.click(within(dialog).getByRole("button", { name: /completar anterior y activar/i }));

    expect(
      await screen.findByText(/Mesociclo activado correctamente/i),
    ).toBeInTheDocument();
  });

  it("logs, edits, and deletes a Training Session from the mobile quick logger", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /^Sesiones$/i }));

    // Fill quick session form
    const sessionName = screen.getByLabelText(/nombre de la sesión/i);
    await user.clear(sessionName);
    await user.type(sessionName, "Pierna A Rápida");

    const exInput = screen.getByLabelText(/ejercicio/i);
    await user.clear(exInput);
    await user.type(exInput, "Prensa inclinada");

    const loadInput = screen.getByLabelText(/carga/i);
    await user.clear(loadInput);
    await user.type(loadInput, "140");

    const repsInput = screen.getByLabelText(/repeticiones/i);
    await user.clear(repsInput);
    await user.type(repsInput, "10");

    await user.type(screen.getByLabelText(/notas de fatiga/i), "Buenas sensaciones");
    await user.click(screen.getByRole("button", { name: /guardar sesión/i }));

    expect(await screen.findByText(/Pierna A Rápida/i)).toBeInTheDocument();

    // Delete the newly created session (with explicit inline confirmation)
    const deleteButtons = screen.getAllByRole("button", { name: /^eliminar$/i });
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole("button", { name: /confirmar eliminación/i }));

    expect(screen.queryByText(/Pierna A Rápida/i)).not.toBeInTheDocument();
  });

  it("displays weekly effective volume per muscle group and deload recommendation", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /volumen y descarga/i }));

    expect(await screen.findByText(/descarga recomendada/i)).toBeInTheDocument();
    expect(screen.getByText(/pecho/i)).toBeInTheDocument();
    expect(screen.getByText(/Caída de rendimiento/i)).toBeInTheDocument();
  });
});
