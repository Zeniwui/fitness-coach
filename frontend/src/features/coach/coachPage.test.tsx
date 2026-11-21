import { beforeEach, describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { App } from "../../app/App";
import { configureApiClient } from "../../api/client";
import { seedSupabaseSession } from "../../test/authHelpers";
import { server } from "../../test/msw/server";
import { getMockPromotedPayloads, resetMockCoachState } from "../../test/msw/handlers/coach";
import { uploadCoachAttachment } from "./sse";

describe("Coach Chat SSE, Citations, Live Search Quarantine & Profile Proposals (#6)", () => {
  beforeEach(() => {
    resetMockCoachState();
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
});
