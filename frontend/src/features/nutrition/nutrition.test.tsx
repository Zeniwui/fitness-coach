import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { seedSupabaseSession } from "../../test/authHelpers";
import { resetMockNutritionState } from "../../test/msw/handlers/nutrition";

describe("Nutrition: Fase Nutricional & Guided Weekly Check-in UI (#8)", () => {
  beforeEach(() => {
    resetMockNutritionState();
    seedSupabaseSession("tok-athlete");
  });

  it("creates, edits, switches, and completes a Fase Nutricional with history", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/nutrition"]} />);

    expect(
      await screen.findByRole("heading", { name: /nutrición/i }),
    ).toBeInTheDocument();

    // SegmentedTabs replace monolithic scroll and mobile anchor strip
    const summaryTab = await screen.findByRole("tab", { name: /resumen y ajuste/i });
    const checkinTab = screen.getByRole("tab", { name: /check-in semanal/i });
    const historyTab = screen.getByRole("tab", { name: /historial/i });
    expect(summaryTab).toHaveAttribute("aria-selected", "true");
    expect(checkinTab).toHaveAttribute("aria-selected", "false");
    expect(historyTab).toHaveAttribute("aria-selected", "false");
    expect(
      screen.queryByRole("navigation", { name: /secciones de nutrición/i }),
    ).not.toBeInTheDocument();

    // Activate initial Cut phase (wait for initial fetch to finish)
    const phaseTypeSelect = await screen.findByLabelText(/tipo de fase/i);
    await user.selectOptions(phaseTypeSelect, "cut");
    await user.clear(screen.getByLabelText(/calorías objetivo/i));
    await user.type(screen.getByLabelText(/calorías objetivo/i), "2400");
    await user.clear(screen.getByLabelText(/proteína/i));
    await user.type(screen.getByLabelText(/proteína/i), "185");
    await user.clear(screen.getByLabelText(/grasas/i));
    await user.type(screen.getByLabelText(/grasas/i), "65");
    await user.clear(screen.getByLabelText(/carbohidratos/i));
    await user.type(screen.getByLabelText(/carbohidratos/i), "269");
    await user.clear(screen.getByLabelText(/ritmo semanal objetivo/i));
    await user.type(screen.getByLabelText(/ritmo semanal objetivo/i), "-0.5");

    await user.click(screen.getByRole("button", { name: /activar fase nutricional/i }));

    expect(await screen.findByText(/fase nutricional activada/i)).toBeInTheDocument();
    expect(screen.getByText(/2400 kcal/i)).toBeInTheDocument();

    // Complete the active phase (with inline confirmation) and verify it appears in Historial tab
    await user.click(screen.getByRole("button", { name: /finalizar fase/i }));
    await user.click(screen.getByRole("button", { name: /confirmar fin/i }));
    expect(await screen.findByText(/fase nutricional finalizada/i)).toBeInTheDocument();

    await user.click(historyTab);
    expect(screen.getByText(/historial de fases nutricionales/i)).toBeInTheDocument();
    expect(screen.getByText(/definición · 2400 kcal/i)).toBeInTheDocument();
  });

  it("submits a guided weekly Check-in from its tab, lands on Resumen y Ajuste with pending indicator, and applies on confirmation", async () => {
    resetMockNutritionState({
      phases: [
        {
          id: "20000000-0000-0000-0000-000000000099",
          athlete_id: "11111111-1111-1111-1111-111111111111",
          phase_type: "cut",
          status: "active",
          start_date: "2026-10-01",
          end_date: null,
          target_calories: 2400,
          protein_g: 185,
          fat_g: 65,
          carbs_g: 269,
          target_weekly_weight_change_kg: -0.5,
          notes: "Definición base",
          created_at: "2026-10-01T10:00:00Z",
          updated_at: "2026-10-01T10:00:00Z",
        },
      ],
      checkins: [
        {
          id: "30000000-0000-0000-0000-000000000099",
          athlete_id: "11111111-1111-1111-1111-111111111111",
          nutrition_phase_id: "20000000-0000-0000-0000-000000000099",
          checkin_date: "2026-11-14",
          idempotency_key: "seed-prev-checkin",
          average_weight_kg: 82.0,
          daily_weights: [82.0],
          body_measurements: { waist_cm: 84.5 },
          adherence_score: 9,
          sleep_quality: 8,
          energy_level: 7,
          hunger_level: 5,
          recovery_score: 8,
          perceived_fatigue: 4,
          performance_notes: "Semana estable.",
          estimated_tdee_delta_kcal: null,
          weight_trend: {
            current_weight_kg: 82.0,
            previous_weight_kg: null,
            actual_weekly_change_kg: null,
            target_weekly_change_kg: -0.5,
            weekly_deviation_kg: null,
            estimated_tdee_delta_kcal: null,
            trend_status: "insufficient_data",
          },
          coach_recommendations: {
            summary_es: "Primer punto de referencia registrado.",
            rationale_es: "Sin ajuste necesario.",
            calorie_delta_kcal: 0,
            proposed_target_calories: 2400,
            proposed_protein_g: 185,
            proposed_fat_g: 65,
            proposed_carbs_g: 269,
            training_adjustment_es: null,
            cited_card_ids: [],
            respects_profile_notes: null,
          },
          adjustment_status: "none",
          adjustment_resolved_at: null,
          created_at: "2026-11-14T10:00:00Z",
        },
      ],
    });

    const user = userEvent.setup();
    render(<App initialEntries={["/nutrition"]} />);

    expect(await screen.findByText(/2400 kcal/i)).toBeInTheDocument();

    // Switch to Check-in semanal tab
    await user.click(screen.getByRole("tab", { name: /check-in semanal/i }));

    // Fill guided weekly Check-in form (stalled weight + high fatigue)
    await user.type(screen.getByLabelText(/peso medio semanal/i), "81.95");
    await user.type(screen.getByLabelText(/cintura/i), "84.4");
    await user.clear(screen.getByLabelText(/fatiga percibida/i));
    await user.type(screen.getByLabelText(/fatiga percibida/i), "9");
    await user.type(
      screen.getByLabelText(/notas de rendimiento/i),
      "Piernas pesadas en sentadilla",
    );

    await user.click(screen.getByRole("button", { name: /enviar check-in semanal/i }));

    // Lands on Resumen y Ajuste with pending proposal indicator on tab and Coach proposal card
    const summaryTabAfterSubmit = await screen.findByRole("tab", {
      name: /resumen y ajuste.*pendiente/i,
    });
    expect(summaryTabAfterSubmit).toHaveAttribute("aria-selected", "true");

    expect(
      await screen.findByText(/propuesta de ajuste del coach/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/2225 kcal/i)).toBeInTheDocument();
    expect(screen.getByText(/reduce un 20-30 % el volumen semanal/i)).toBeInTheDocument();

    // Explicit Athlete confirmation applies adjustment to active Fase Nutricional
    await user.click(screen.getByRole("button", { name: /aplicar ajuste/i }));

    expect(
      await screen.findByText(/ajuste aplicado a tu fase nutricional activa/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/propuesta aplicada/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /resumen y ajuste.*pendiente/i }),
    ).not.toBeInTheDocument();
  });

  it("lands on Resumen y Ajuste with a visible pending indicator when an unresolved Coach proposal exists on load", async () => {
    resetMockNutritionState({
      phases: [
        {
          id: "20000000-0000-0000-0000-000000000077",
          athlete_id: "11111111-1111-1111-1111-111111111111",
          phase_type: "cut",
          status: "active",
          start_date: "2026-10-01",
          end_date: null,
          target_calories: 2400,
          protein_g: 185,
          fat_g: 65,
          carbs_g: 269,
          target_weekly_weight_change_kg: -0.5,
          notes: null,
          created_at: "2026-10-01T10:00:00Z",
          updated_at: "2026-10-01T10:00:00Z",
        },
      ],
      checkins: [
        {
          id: "30000000-0000-0000-0000-000000000077",
          athlete_id: "11111111-1111-1111-1111-111111111111",
          nutrition_phase_id: "20000000-0000-0000-0000-000000000077",
          checkin_date: "2026-11-21",
          idempotency_key: "seed-pending-proposal",
          average_weight_kg: 81.95,
          daily_weights: [82.0, 81.9],
          body_measurements: {},
          adherence_score: 9,
          sleep_quality: 8,
          energy_level: 7,
          hunger_level: 5,
          recovery_score: 8,
          perceived_fatigue: 5,
          performance_notes: null,
          estimated_tdee_delta_kcal: -200,
          weight_trend: {
            current_weight_kg: 81.95,
            previous_weight_kg: 82.0,
            actual_weekly_change_kg: -0.05,
            target_weekly_change_kg: -0.5,
            weekly_deviation_kg: 0.45,
            estimated_tdee_delta_kcal: -200,
            trend_status: "losing_too_slow",
          },
          coach_recommendations: {
            summary_es: "Propongo reducir 175 kcal/día para acercarte al ritmo objetivo.",
            rationale_es: "Ajuste conservador.",
            calorie_delta_kcal: -175,
            proposed_target_calories: 2225,
            proposed_protein_g: 185,
            proposed_fat_g: 65,
            proposed_carbs_g: 225,
            training_adjustment_es: null,
            cited_card_ids: [],
            respects_profile_notes: null,
          },
          adjustment_status: "proposed",
          adjustment_resolved_at: null,
          created_at: "2026-11-21T10:00:00Z",
        },
      ],
    });

    const user = userEvent.setup();
    render(<App initialEntries={["/nutrition"]} />);

    const summaryTab = await screen.findByRole("tab", {
      name: /resumen y ajuste.*pendiente/i,
    });
    expect(summaryTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/2225 kcal/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /descartar/i }));
    expect(
      await screen.findByText(/tu fase nutricional permanece sin cambios/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /resumen y ajuste.*pendiente/i }),
    ).not.toBeInTheDocument();
  });

  it("parses Spanish decimal commas and mixed separators without silent corruption and shows live preview", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/nutrition"]} />);

    await user.click(await screen.findByRole("tab", { name: /check-in semanal/i }));

    const dailyInput = screen.getByLabelText(/lecturas diarias/i);

    // Mixed comma & dot decimals must NOT split 82,1 into 82 and 1
    await user.type(dailyInput, "82,1, 82.0, 81,9");
    expect(screen.getByText(/media detectada: 82\.00 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/3 pesajes: 82\.1 · 82 · 81\.9 kg/i)).toBeInTheDocument();

    // Semicolon-separated Spanish decimals
    await user.clear(dailyInput);
    await user.type(dailyInput, "82,1; 81,9");
    expect(screen.getByText(/media detectada: 82\.00 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pesajes: 82\.1 · 81\.9 kg/i)).toBeInTheDocument();

    // Comma-separated Spanish decimals without spaces
    await user.clear(dailyInput);
    await user.type(dailyInput, "82,1,81,9");
    expect(screen.getByText(/media detectada: 82\.00 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/2 pesajes: 82\.1 · 81\.9 kg/i)).toBeInTheDocument();

    // Backward-compatible dot decimals with commas
    await user.clear(dailyInput);
    await user.type(dailyInput, "82.2, 82.0, 81.8");
    expect(screen.getByText(/media detectada: 82\.00 kg/i)).toBeInTheDocument();
    expect(screen.getByText(/3 pesajes: 82\.2 · 82 · 81\.8 kg/i)).toBeInTheDocument();

    // Space-separated Spanish decimals submit cleanly and appear in Historial
    await user.clear(dailyInput);
    await user.type(dailyInput, "82,1 81,9");
    await user.click(screen.getByRole("button", { name: /enviar check-in semanal/i }));
    expect(await screen.findByText(/check-in semanal registrado/i)).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: /historial/i }));
    expect(screen.getByText(/82 kg/i)).toBeInTheDocument();
  });
});
