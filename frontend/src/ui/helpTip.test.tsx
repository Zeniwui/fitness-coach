import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HelpTip } from "./HelpTip";
import { ExerciseGroupCard } from "../features/training/ExerciseGroupCard";
import { MesocycleEditor } from "../features/training/MesocycleEditor";
import { ActivePhasePanel } from "../features/nutrition/ActivePhasePanel";

describe("HelpTip contextual inline help primitive & domain integrations (#18)", () => {
  it("toggles inline explanation with aria-expanded/aria-controls and closes on Escape restoring focus", async () => {
    const user = userEvent.setup();
    render(
      <HelpTip term="RIR" title="Repeticiones en recámara (RIR)">
        Indica cuántas repeticiones podrías haber completado antes del fallo muscular.
      </HelpTip>,
    );

    const trigger = screen.getByRole("button", { name: /ayuda sobre rir/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText(/cuántas repeticiones podrías haber completado/i),
    ).not.toBeInTheDocument();

    // Open
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const panelId = trigger.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();
    const panel = document.getElementById(panelId!);
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveTextContent(/repeticiones en recámara/i);
    expect(panel).toHaveTextContent(/cuántas repeticiones podrías haber completado/i);

    // Close on Escape and restore focus to trigger
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText(/cuántas repeticiones podrías haber completado/i),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    // Re-open and close on second click
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("renders accessible inline RIR help inside ExerciseGroupCard and MesocycleEditor", async () => {
    const user = userEvent.setup();
    render(
      <>
        <ExerciseGroupCard
          group={{
            id: "g-1",
            exercise_name: "Press inclinado",
            muscle_group: "pecho",
            secondary_muscle_groups: "hombros",
            unit: "kg",
            isBodyweight: false,
            sets: [
              {
                id: "s-1",
                reps: "8",
                load: "30",
                rir: "2",
                rpe: "",
                completed: false,
              },
            ],
          }}
          groupIndex={0}
          canRemoveGroup={false}
          onChange={vi.fn()}
          onRemoveGroup={vi.fn()}
        />
        <MesocycleEditor
          name="Hipertrofia"
          goal="Hipertrofia"
          weeks="5"
          plannedSessions={[
            {
              day_order: 1,
              name: "Torso A",
              exercises: [
                {
                  exercise_name: "Remo en polea",
                  primary_muscle_group: "espalda",
                  secondary_muscle_groups: [],
                  target_sets: 3,
                  rep_range_min: 8,
                  rep_range_max: 12,
                  target_rir: 2,
                  target_rpe: null,
                  notes: null,
                },
              ],
            },
          ]}
          onNameChange={vi.fn()}
          onGoalChange={vi.fn()}
          onWeeksChange={vi.fn()}
          onPlannedSessionsChange={vi.fn()}
          onSave={vi.fn()}
          onCancel={vi.fn()}
        />
      </>,
    );

    const rirHelpButtons = screen.getAllByRole("button", { name: /ayuda sobre rir/i });
    expect(rirHelpButtons).toHaveLength(2);

    await user.click(rirHelpButtons[0]);
    expect(rirHelpButtons[0]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/repeticiones en recámara/i)).toBeInTheDocument();

    await user.click(rirHelpButtons[0]);
    expect(rirHelpButtons[0]).toHaveAttribute("aria-expanded", "false");

    await user.click(rirHelpButtons[1]);
    expect(rirHelpButtons[1]).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/repeticiones en recámara/i)).toBeInTheDocument();
  });

  it("renders accessible inline TDEE help inside ActivePhasePanel", async () => {
    const user = userEvent.setup();
    render(
      <ActivePhasePanel
        activePhase={null}
        phaseForm={{
          phase_type: "cut",
          start_date: "2026-11-21",
          target_calories: "2300",
          protein_g: "180",
          fat_g: "65",
          carbs_g: "250",
          target_weekly_weight_change_kg: "-0.4",
          notes: "",
        }}
        phaseMode="create"
        editorOpen={true}
        savingPhase={false}
        onChangeForm={vi.fn()}
        onOpenEditor={vi.fn()}
        onCloseEditor={vi.fn()}
        onCompletePhase={vi.fn()}
        onSubmit={vi.fn()}
      />,
    );

    const tdeeBtn = screen.getByRole("button", { name: /ayuda sobre tdee/i });
    expect(tdeeBtn).toHaveAttribute("aria-expanded", "false");
    await user.click(tdeeBtn);
    expect(tdeeBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/gasto energético total diario/i)).toBeInTheDocument();
  });
});
