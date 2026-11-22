import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { App } from "../../app/App";
import { configureApiClient } from "../../api/client";
import { seedSupabaseSession } from "../../test/authHelpers";
import { server } from "../../test/msw/server";
import { getMockPromotedPayloads, resetMockCoachState } from "../../test/msw/handlers/coach";
import { resetMockProfileState } from "../../test/msw/handlers/profile";
import { resetMockNutritionState } from "../../test/msw/handlers/nutrition";
import { resetMockTrainingState } from "../../test/msw/handlers/training";
import { uploadCoachAttachment } from "./sse";

describe("Coach Chat SSE, Citations, Live Search Quarantine & Profile Proposals (#6)", () => {
  beforeEach(() => {
    resetMockCoachState();
    resetMockProfileState();
    resetMockNutritionState();
    resetMockTrainingState();
    seedSupabaseSession("tok-athlete");
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

  it("surfaces ColdStartBanner during slow Coach SSE streaming and image attachment upload", async () => {
    configureApiClient({ coldStartThresholdMs: 30, retryDelayMs: 20 });
    server.use(
      http.post("*/api/v1/coach/conversations/:conversationId/messages", async () => {
        await delay(120);
        const sseBody =
          'event: token\ndata: {"delta":"Respuesta tras cold start"}\n\n' +
          'event: done\ndata: {"message":{"id":"m-cs","conversation_id":"conv-1","role":"assistant","content":"Respuesta tras cold start","citations":[],"live_search_results":[],"used_general_knowledge":false,"boundary_triggered":"none","created_at":"2026-11-21T18:00:00Z"}}\n\n';
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
      http.post("*/api/v1/multimodal/attachments", async () => {
        await delay(120);
        return HttpResponse.json(
          {
            id: "att-cs-1",
            category: "meal",
            filename: "plato.jpg",
            mime_type: "image/jpeg",
            size_bytes: 123,
            created_at: "2026-11-21T18:00:00Z",
          },
          { status: 201 },
        );
      }),
    );

    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const input = await screen.findByLabelText(/mensaje para el coach/i);
    await user.type(input, "Hola Coach");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(
      await screen.findByText(/activando servidor tras periodo de inactividad/i),
    ).toBeInTheDocument();
    expect(await screen.findByText(/respuesta tras cold start/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByText(/activando servidor tras periodo de inactividad/i),
      ).not.toBeInTheDocument();
    });

    // Also verify slow image upload surfaces ColdStartBanner
    const uploadPromise = uploadCoachAttachment(
      new File(["img-bytes"], "plato.jpg", { type: "image/jpeg" }),
      "meal",
    );
    expect(
      await screen.findByText(/activando servidor tras periodo de inactividad/i),
    ).toBeInTheDocument();
    const uploaded = await uploadPromise;
    expect(uploaded.id).toBe("att-cs-1");
  });

  it("renders GFM Markdown tables from Coach responses inside a horizontally scrollable semantic table", async () => {
    server.use(
      http.post("*/api/v1/coach/conversations/:conversationId/messages", () => {
        const tableMarkdown = [
          "Comparativa de volumen semanal:",
          "",
          "| Grupo muscular | Series semanales | RIR objetivo |",
          "| :--- | :---: | ---: |",
          "| **Pecho** | 12–16 | 1–2 |",
          "| Espalda | 14–18 | 2 |",
        ].join("\n");
        const sseBody =
          `event: token\ndata: ${JSON.stringify({ delta: tableMarkdown })}\n\n` +
          `event: done\ndata: ${JSON.stringify({
            message: {
              id: "m-table-1",
              conversation_id: "aaaa0000-0000-0000-0000-000000000001",
              role: "assistant",
              content: tableMarkdown,
              citations: [],
              live_search_results: [],
              used_general_knowledge: false,
              boundary_triggered: "none",
              created_at: "2026-11-21T18:10:00Z",
            },
          })}\n\n`;
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const input = await screen.findByLabelText(/mensaje para el coach/i);
    await user.type(input, "Dame una tabla de volumen");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    const table = await screen.findByRole("table");
    expect(table.parentElement).toHaveClass("overflow-x-auto");
    const headers = screen.getAllByRole("columnheader");
    expect(headers.map((h) => h.textContent)).toEqual([
      "Grupo muscular",
      "Series semanales",
      "RIR objetivo",
    ]);
    expect(headers[0]).toHaveAttribute("scope", "col");
    expect(screen.getByRole("cell", { name: "Pecho" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "12–16" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "14–18" })).toBeInTheDocument();
  });

  it("renames a conversation inline and deletes the active thread with confirmation, updating list and selection", async () => {
    resetMockCoachState({
      conversations: [
        {
          id: "aaaa0000-0000-0000-0000-000000000001",
          title: "Bloque de hipertrofia",
          created_at: "2026-11-21T10:00:00Z",
          updated_at: "2026-11-21T10:00:00Z",
        },
        {
          id: "aaaa0000-0000-0000-0000-000000000002",
          title: "Ajuste nutricional",
          created_at: "2026-11-21T09:00:00Z",
          updated_at: "2026-11-21T09:00:00Z",
        },
      ],
      messagesByConv: {
        "aaaa0000-0000-0000-0000-000000000001": [
          {
            id: "m-1",
            conversation_id: "aaaa0000-0000-0000-0000-000000000001",
            role: "assistant",
            content: "Mensaje del primer hilo.",
            citations: [],
            live_search_results: [],
            used_general_knowledge: false,
            boundary_triggered: "none",
            created_at: "2026-11-21T10:01:00Z",
          },
        ],
        "aaaa0000-0000-0000-0000-000000000002": [
          {
            id: "m-2",
            conversation_id: "aaaa0000-0000-0000-0000-000000000002",
            role: "assistant",
            content: "Mensaje del segundo hilo.",
            citations: [],
            live_search_results: [],
            used_general_knowledge: false,
            boundary_triggered: "none",
            created_at: "2026-11-21T09:01:00Z",
          },
        ],
      },
    });

    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    expect(await screen.findByText(/mensaje del primer hilo/i)).toBeInTheDocument();

    // Rename the first conversation inline
    await user.click(
      screen.getByRole("button", { name: /renombrar conversación bloque de hipertrofia/i }),
    );
    const renameInput = screen.getByLabelText(/nuevo título de conversación/i);
    await user.clear(renameInput);
    await user.type(renameInput, "Mesociclo Otoño");
    await user.click(screen.getByRole("button", { name: /guardar título/i }));

    expect(
      await screen.findByRole("button", { name: /^mesociclo otoño$/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^bloque de hipertrofia$/i })).not.toBeInTheDocument();

    // Delete the active conversation with inline confirmation -> switches to remaining thread
    await user.click(
      screen.getByRole("button", { name: /eliminar conversación mesociclo otoño/i }),
    );
    await user.click(screen.getByRole("button", { name: /confirmar eliminación/i }));

    await waitFor(() => {
      expect(screen.queryByText(/mesociclo otoño/i)).not.toBeInTheDocument();
    });
    expect(await screen.findByText(/mensaje del segundo hilo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^ajuste nutricional$/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("shows disposable onboarding checklist when setup is incomplete, persists dismissal per Athlete, and hides when all steps are complete", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App initialEntries={["/coach"]} />);

    const checklist = await screen.findByRole("region", { name: /primeros pasos/i });
    expect(checklist).toBeInTheDocument();
    // Default mocks: Perfil Vivo incomplete, Mesociclo active (complete), Fase Nutricional missing
    expect(screen.getByRole("link", { name: /completar perfil vivo/i })).toHaveAttribute(
      "href",
      "/profile",
    );
    expect(screen.getByRole("link", { name: /activar fase nutricional/i })).toHaveAttribute(
      "href",
      "/nutrition",
    );
    expect(checklist).toHaveTextContent(/mesociclo activo/i);

    // Dismiss checklist -> hidden and persisted in localStorage for this Athlete
    await user.click(screen.getByRole("button", { name: /ocultar primeros pasos/i }));
    expect(screen.queryByRole("region", { name: /primeros pasos/i })).not.toBeInTheDocument();

    // Remount as same Athlete -> stays hidden
    unmount();
    const remountSame = render(<App initialEntries={["/coach"]} />);
    await screen.findByLabelText(/mensaje para el coach/i);
    expect(screen.queryByRole("region", { name: /primeros pasos/i })).not.toBeInTheDocument();
    remountSame.unmount();

    // Mount as a DIFFERENT Athlete (Curator+Athlete) -> checklist is still visible for them
    seedSupabaseSession("tok-dual");
    const remountOther = render(<App initialEntries={["/coach"]} />);
    expect(await screen.findByRole("region", { name: /primeros pasos/i })).toBeInTheDocument();
    remountOther.unmount();

    // When all 3 prerequisites are complete -> checklist auto-hides even without dismissal
    resetMockProfileState({ has_saved_profile: true });
    resetMockNutritionState({
      phases: [
        {
          id: "phase-active-1",
          athlete_id: "22222222-2222-2222-2222-222222222222",
          phase_type: "maintenance",
          status: "active",
          start_date: "2026-11-01",
          end_date: null,
          target_calories: 2500,
          protein_g: 180,
          fat_g: 75,
          carbs_g: 275,
          target_weekly_weight_change_kg: 0,
          notes: null,
          created_at: "2026-11-01T10:00:00Z",
          updated_at: "2026-11-01T10:00:00Z",
        },
      ],
    });
    render(<App initialEntries={["/coach"]} />);
    await screen.findByLabelText(/mensaje para el coach/i);
    await waitFor(() => {
      expect(screen.queryByRole("region", { name: /primeros pasos/i })).not.toBeInTheDocument();
    });
  });

  it("auto-scrolls messages container on new responses while respecting manual scroll-up by the Athlete", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const container = await screen.findByLabelText(/mensajes de la conversación/i);
    let currentScrollTop = 500;
    Object.defineProperty(container, "scrollHeight", {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(container, "clientHeight", {
      configurable: true,
      get: () => 500,
    });
    Object.defineProperty(container, "scrollTop", {
      configurable: true,
      get: () => currentScrollTop,
      set: (val: number) => {
        currentScrollTop = val;
      },
    });

    // At bottom -> sending a message auto-scrolls to scrollHeight (1000)
    const input = screen.getByLabelText(/mensaje para el coach/i);
    await user.type(input, "¿Qué dosis de creatina recomiendas?");
    await user.click(screen.getByRole("button", { name: /enviar/i }));
    expect(
      await screen.findByText(/la creatina monohidrato a 3-5 g\/día mejora fuerza/i),
    ).toBeInTheDocument();
    expect(currentScrollTop).toBe(1000);

    // Athlete manually scrolls up to re-read earlier messages
    currentScrollTop = 100;
    fireEvent.scroll(container);

    // A delayed SSE response arrives while scrolled up -> viewport is NOT yanked back to bottom
    server.use(
      http.post("*/api/v1/coach/conversations/:conversationId/messages", async () => {
        await delay(40);
        const sseBody =
          'event: token\ndata: {"delta":"Nueva respuesta respetando tu lectura."}\n\n' +
          'event: done\ndata: {"message":{"id":"m-scroll-2","conversation_id":"aaaa0000-0000-0000-0000-000000000001","role":"assistant","content":"Nueva respuesta respetando tu lectura.","citations":[],"live_search_results":[],"used_general_knowledge":false,"boundary_triggered":"none","created_at":"2026-11-21T18:20:00Z"}}\n\n';
        return new HttpResponse(sseBody, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }),
    );

    await user.type(input, "Segunda consulta");
    await user.click(screen.getByRole("button", { name: /enviar/i }));
    // Scroll back up immediately while stream is in flight
    currentScrollTop = 120;
    fireEvent.scroll(container);

    expect(
      await screen.findByText(/nueva respuesta respetando tu lectura/i),
    ).toBeInTheDocument();
    expect(currentScrollTop).toBe(120);
  });
});
