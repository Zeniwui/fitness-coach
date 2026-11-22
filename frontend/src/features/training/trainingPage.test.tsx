import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("starts from Hoy into a grouped exercise sheet with steppers, completion toggle, set/exercise actions, and PR achievement summary", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByRole("heading", { name: /sesión planificada: torso a/i });

    // Start logging from Today tab
    const startButtons = screen.getAllByRole("button", { name: /registrar esta sesión/i });
    await user.click(startButtons[0]);

    // Grouped by exercise: 2 exercise groups (not 6 separate flat exercise inputs)
    const exerciseInputs = await screen.findAllByLabelText(/^Ejercicio$/i);
    expect(exerciseInputs).toHaveLength(2);
    expect(exerciseInputs[0]).toHaveValue("Press inclinado mancuernas");
    expect(exerciseInputs[1]).toHaveValue("Remo en polea baja");

    // Prescription and previous mark visible in the exercise header
    const pressGroup = screen.getByRole("group", { name: /Press inclinado mancuernas/i });
    expect(within(pressGroup).getByText(/3 series · 8–10 reps · RIR 1/i)).toBeInTheDocument();
    expect(within(pressGroup).getByText(/Marca previa \(2026-11-18\): 32 kg × 9/i)).toBeInTheDocument();

    // Load stepper +2.5 kg updates set 1 from 32 -> 34.5 (beats prior 32 kg PR)
    const plusBtn = within(pressGroup).getByRole("button", { name: /sumar 2\.5 kg en serie 1/i });
    await user.click(plusBtn);
    const pressLoadInputs = within(pressGroup).getAllByLabelText(/carga \(kg\)/i);
    expect(pressLoadInputs[0]).toHaveValue(34.5);

    // Completion toggle on set 1
    const completeBtn = within(pressGroup).getByRole("button", {
      name: /marcar serie 1 completada/i,
    });
    expect(completeBtn).toHaveAttribute("aria-pressed", "false");
    await user.click(completeBtn);
    expect(completeBtn).toHaveAttribute("aria-pressed", "true");

    // Duplicate last set -> Press now has 4 sets; then remove the 4th set -> back to 3
    await user.click(within(pressGroup).getByRole("button", { name: /duplicar última serie/i }));
    expect(within(pressGroup).getAllByLabelText(/carga \(kg\)/i)).toHaveLength(4);
    await user.click(within(pressGroup).getByRole("button", { name: /quitar serie 4/i }));
    expect(within(pressGroup).getAllByLabelText(/carga \(kg\)/i)).toHaveLength(3);

    // Switch second exercise ("Remo en polea baja") to lb -> steppers switch to ±5 lb
    const remoGroup = screen.getByRole("group", { name: /Remo en polea baja/i });
    await user.selectOptions(within(remoGroup).getByLabelText(/unidad/i), "lb");
    const plusLbBtn = within(remoGroup).getByRole("button", { name: /sumar 5 lb en serie 1/i });
    await user.click(plusLbBtn);
    const remoLoadInputs = within(remoGroup).getAllByLabelText(/carga \(lb\)/i);
    expect(remoLoadInputs[0]).toHaveValue(5);

    // Fill loads for Remo sets 2 & 3 so validation passes, or mark Remo sets
    await user.type(remoLoadInputs[1], "110");
    await user.type(remoLoadInputs[2], "110");

    // Add an extra exercise block and remove it
    await user.click(screen.getByRole("button", { name: /añadir ejercicio/i }));
    expect(screen.getAllByLabelText(/^Ejercicio$/i)).toHaveLength(3);
    const removeGroupButtons = screen.getAllByRole("button", { name: /quitar ejercicio/i });
    await user.click(removeGroupButtons[removeGroupButtons.length - 1]);
    expect(screen.getAllByLabelText(/^Ejercicio$/i)).toHaveLength(2);

    // Save session and verify achievement summary with effective sets & PR on Press inclinado
    await user.click(screen.getByRole("button", { name: /guardar sesión/i }));

    const achievementRegion = await screen.findByRole("status", {
      name: /resumen de la sesión guardada/i,
    });
    expect(achievementRegion).toHaveTextContent(/6 series efectivas/i);
    expect(achievementRegion).toHaveTextContent(/récord personal/i);
    expect(achievementRegion).toHaveTextContent(/Press inclinado mancuernas/i);
    expect(achievementRegion).toHaveTextContent(/34\.5 kg/i);
  });

  it("validates missing load honestly unless Peso corporal is toggled explicitly", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /^Sesiones$/i }));

    const exInput = screen.getByLabelText(/^Ejercicio$/i);
    await user.type(exInput, "Dominadas estrictas");

    // Attempt to save with empty load -> clear validation error, NOT saved silently as 0 kg
    await user.click(screen.getByRole("button", { name: /guardar sesión/i }));
    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent(/falta la carga.*Dominadas estrictas.*Peso corporal/i);

    // Explicitly toggle Peso corporal -> saves cleanly with 0 kg
    const bodyweightBtn = screen.getByRole("button", { name: /peso corporal/i });
    await user.click(bodyweightBtn);
    expect(bodyweightBtn).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: /guardar sesión/i }));
    expect(
      await screen.findByRole("status", { name: /resumen de la sesión guardada/i }),
    ).toHaveTextContent(/1 series efectivas/i);
  });

  it("migrates legacy flat v1 localStorage drafts into grouped exercises and allows discarding draft with confirmation", async () => {
    window.localStorage.setItem(
      "fc-training-session-draft-v1",
      JSON.stringify({
        sessionDate: "2026-11-20",
        sessionName: "Borrador antiguo",
        sessionPlannedId: null,
        fatigueNotes: "Hombro cargado",
        startedFromToday: false,
        setRows: [
          {
            exercise_name: "Curl bíceps barra",
            muscle_group: "biceps",
            secondary_muscle_groups: "",
            reps: "10",
            load: "30",
            unit: "kg",
            rir: "2",
            rpe: "",
          },
          {
            exercise_name: "Curl bíceps barra",
            muscle_group: "biceps",
            secondary_muscle_groups: "",
            reps: "9",
            load: "30",
            unit: "kg",
            rir: "1",
            rpe: "",
          },
        ],
      }),
    );

    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /^Sesiones$/i }));

    // Legacy 2 flat rows migrated into 1 grouped exercise with 2 sets
    const exerciseInputs = screen.getAllByLabelText(/^Ejercicio$/i);
    expect(exerciseInputs).toHaveLength(1);
    expect(exerciseInputs[0]).toHaveValue("Curl bíceps barra");
    expect(screen.getAllByLabelText(/carga \(kg\)/i)).toHaveLength(2);
    expect(screen.getByLabelText(/nombre de la sesión/i)).toHaveValue("Borrador antiguo");

    // Debounced autosave persists upgraded v2 grouped format to localStorage
    await waitFor(() => {
      const saved = JSON.parse(
        window.localStorage.getItem("fc-training-session-draft-v1") ?? "{}",
      ) as { version?: number; exerciseGroups?: unknown[] };
      expect(saved.version).toBe(2);
      expect(saved.exerciseGroups).toHaveLength(1);
    });

    // Discard draft with inline confirmation
    await user.click(screen.getByRole("button", { name: /descartar borrador/i }));
    await user.click(screen.getByRole("button", { name: /confirmar descarte/i }));

    expect(screen.getByLabelText(/^Ejercicio$/i)).toHaveValue("");
    expect(screen.getByLabelText(/nombre de la sesión/i)).toHaveValue("Sesión de Entrenamiento");
    expect(window.localStorage.getItem("fc-training-session-draft-v1")).toBeNull();
  });

  it("edits planned sessions and exercises inside a Mesociclo and persists via PATCH", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /^Mesociclos$/i }));

    // Open editor for the active Mesociclo
    const editButtons = screen.getAllByRole("button", { name: /^editar$/i });
    await user.click(editButtons[0]);

    // Planned day 1 ("Torso A") shows its exercises
    const day1Group = screen.getByRole("group", { name: /día 1: torso a/i });
    const exNameInputs = within(day1Group).getAllByLabelText(/^Ejercicio$/i);
    expect(exNameInputs).toHaveLength(2);
    expect(exNameInputs[0]).toHaveValue("Press inclinado mancuernas");

    // Update target sets and rep range on exercise 1
    const targetSetsInputs = within(day1Group).getAllByLabelText(/series objetivo/i);
    await user.clear(targetSetsInputs[0]);
    await user.type(targetSetsInputs[0], "4");

    // Add a new exercise to Day 1
    await user.click(within(day1Group).getByRole("button", { name: /añadir ejercicio/i }));
    const updatedExInputs = within(day1Group).getAllByLabelText(/^Ejercicio$/i);
    expect(updatedExInputs).toHaveLength(3);
    await user.type(updatedExInputs[2], "Elevaciones laterales");

    // Remove exercise 2 ("Remo en polea baja") -> leaves 2 exercises
    const removeButtons = within(day1Group).getAllByRole("button", {
      name: /quitar ejercicio/i,
    });
    await user.click(removeButtons[1]);
    expect(within(day1Group).getAllByLabelText(/^Ejercicio$/i)).toHaveLength(2);

    // Save changes via PATCH
    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));
    expect(await screen.findByText(/Mesociclo actualizado correctamente/i)).toBeInTheDocument();

    // Switch back to Hoy tab and confirm updated prescription & new exercise appear
    await user.click(screen.getByRole("tab", { name: /^Hoy$/i }));
    expect(await screen.findByText(/Elevaciones laterales/i)).toBeInTheDocument();
    expect(screen.getByText(/4 series · 8–10 reps/i)).toBeInTheDocument();
  });

  it("shows truthful insufficient-data states for multi-week volume and e1RM charts when history has fewer than 2 weeks/sessions", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /volumen y descarga/i }));

    // Default seed has only 1 session (1 week)
    expect(
      await screen.findByRole("heading", { name: /evolución multi-semana de volumen efectivo/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 semana más/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("img", { name: /evolución multi-semana de volumen efectivo/i }),
    ).not.toBeInTheDocument();

    expect(
      screen.getByRole("heading", { name: /progresión de fuerza estimada \(e1rm\)/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/al menos 2 sesiones de entrenamiento/i)).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /progresión de fuerza/i })).not.toBeInTheDocument();
  });

  it("renders accessible multi-week volume bar chart with muscle filter and e1RM progression chart with exercise selector", async () => {
    resetMockTrainingState({
      sessions: [
        {
          id: "70000000-0000-0000-0000-000000000903",
          mesocycle_id: "70000000-0000-0000-0000-000000000001",
          planned_session_id: null,
          session_date: "2026-11-18",
          name: "Torso A",
          origin: "manual_form",
          fatigue_notes: null,
          sets: [
            {
              id: "s903-1",
              exercise_name: "Press inclinado mancuernas",
              muscle_group: "pecho",
              secondary_muscle_groups: ["hombros", "triceps"],
              set_order: 1,
              reps: 9,
              load: 34,
              unit: "kg",
              rir: 1,
              rpe: null,
              notes: null,
            },
            {
              id: "s903-2",
              exercise_name: "Remo en polea baja",
              muscle_group: "espalda",
              secondary_muscle_groups: ["biceps"],
              set_order: 2,
              reps: 8,
              load: 150,
              unit: "lb",
              rir: 2,
              rpe: null,
              notes: null,
            },
          ],
          created_at: "2026-11-18T18:00:00Z",
          updated_at: "2026-11-18T18:00:00Z",
        },
        {
          id: "70000000-0000-0000-0000-000000000902",
          mesocycle_id: "70000000-0000-0000-0000-000000000001",
          planned_session_id: null,
          session_date: "2026-11-11",
          name: "Torso A",
          origin: "manual_form",
          fatigue_notes: null,
          sets: [
            {
              id: "s902-1",
              exercise_name: "Press inclinado mancuernas",
              muscle_group: "pecho",
              secondary_muscle_groups: ["triceps"],
              set_order: 1,
              reps: 8,
              load: 32,
              unit: "kg",
              rir: 2,
              rpe: null,
              notes: null,
            },
            {
              id: "s902-2",
              exercise_name: "Press inclinado mancuernas",
              muscle_group: "pecho",
              secondary_muscle_groups: ["triceps"],
              set_order: 2,
              reps: 8,
              load: 32,
              unit: "kg",
              rir: 2,
              rpe: null,
              notes: null,
            },
            {
              id: "s902-3",
              exercise_name: "Remo en polea baja",
              muscle_group: "espalda",
              secondary_muscle_groups: ["biceps"],
              set_order: 3,
              reps: 8,
              load: 60,
              unit: "kg",
              rir: 2,
              rpe: null,
              notes: null,
            },
          ],
          created_at: "2026-11-11T18:00:00Z",
          updated_at: "2026-11-11T18:00:00Z",
        },
        {
          id: "70000000-0000-0000-0000-000000000901",
          mesocycle_id: "70000000-0000-0000-0000-000000000001",
          planned_session_id: null,
          session_date: "2026-11-04",
          name: "Torso A",
          origin: "manual_form",
          fatigue_notes: null,
          sets: [
            {
              id: "s901-1",
              exercise_name: "Press inclinado mancuernas",
              muscle_group: "pecho",
              secondary_muscle_groups: ["triceps"],
              set_order: 1,
              reps: 8,
              load: 30,
              unit: "kg",
              rir: 2,
              rpe: null,
              notes: null,
            },
          ],
          created_at: "2026-11-04T18:00:00Z",
          updated_at: "2026-11-04T18:00:00Z",
        },
      ],
    });

    const user = userEvent.setup();
    render(<App initialEntries={["/training"]} />);

    await screen.findByText(/Mesociclo Hipertrofia Torso-Pierna/i);
    await user.click(screen.getByRole("tab", { name: /volumen y descarga/i }));

    // Multi-week effective volume bar chart defaults to "Todos los grupos" across 3 weeks
    const volumeChart = await screen.findByRole("img", {
      name: /evolución multi-semana de volumen efectivo.*todos los grupos/i,
    });
    expect(volumeChart).toBeInTheDocument();
    expect(volumeChart).toHaveAttribute("aria-label", expect.stringMatching(/3 semanas/i));

    // Switch muscle-group selector to "pecho" -> chart aria-label updates
    const muscleSelect = screen.getByLabelText(/filtrar volumen por grupo muscular/i);
    await user.selectOptions(muscleSelect, "pecho");
    expect(
      screen.getByRole("img", { name: /evolución multi-semana de volumen efectivo.*pecho/i }),
    ).toBeInTheDocument();

    // e1RM & best-load progression chart defaults to Press inclinado mancuernas (3 sessions)
    const e1rmChart = screen.getByRole("img", {
      name: /progresión de fuerza.*press inclinado mancuernas/i,
    });
    expect(e1rmChart).toBeInTheDocument();
    expect(e1rmChart).toHaveAttribute("aria-label", expect.stringMatching(/44\.2 kg/i));

    // Switch exercise selector to "Remo en polea baja" (2 sessions, mixed kg & lb)
    const exerciseSelect = screen.getByLabelText(/seleccionar ejercicio/i);
    await user.selectOptions(exerciseSelect, "remo en polea baja");
    const remoChart = screen.getByRole("img", {
      name: /progresión de fuerza.*remo en polea baja/i,
    });
    expect(remoChart).toBeInTheDocument();
    // 150 lb x 8 = 68.04 kg load, 86.18 kg e1RM
    expect(remoChart).toHaveAttribute("aria-label", expect.stringMatching(/86\.2 kg|86\.18 kg/i));
  });
});
