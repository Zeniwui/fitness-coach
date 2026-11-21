import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../../app/App";
import { setAuthToken } from "../../api/client";
import { resetMockCoachState } from "../../test/msw/handlers/coach";
import {
  getMockParseNaturalCalls,
  getMockUploadedAttachments,
  resetMockMultimodalState,
} from "../../test/msw/handlers/multimodal";
import { resetMockTrainingState } from "../../test/msw/handlers/training";

class MockSpeechRecognition {
  static nextTranscript = "Cuánta proteína debo tomar al día";
  static nextError: string | null = null;

  lang = "";
  continuous = false;
  interimResults = false;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;

  start() {
    if (MockSpeechRecognition.nextError) {
      this.onerror?.({ error: MockSpeechRecognition.nextError });
      this.onend?.();
      return;
    }
    const transcript = MockSpeechRecognition.nextTranscript;
    this.onresult?.({
      resultIndex: 0,
      results: [
        Object.assign([{ transcript }], {
          isFinal: true,
        }),
      ],
    });
    this.onend?.();
  }

  stop() {
    this.onend?.();
  }
}

describe("Multimodal Gym Flows: Voice Dictation, NL Training Session Draft & Images (#9)", () => {
  const originalSR = (window as unknown as Record<string, unknown>).SpeechRecognition;
  const originalWebkitSR = (window as unknown as Record<string, unknown>).webkitSpeechRecognition;

  beforeEach(() => {
    resetMockCoachState();
    resetMockMultimodalState();
    resetMockTrainingState();
    setAuthToken("tok-athlete");
    MockSpeechRecognition.nextError = null;
    MockSpeechRecognition.nextTranscript = "Cuánta proteína debo tomar al día";
    (window as unknown as Record<string, unknown>).SpeechRecognition = MockSpeechRecognition;
    delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
  });

  afterEach(() => {
    if (originalSR !== undefined) {
      (window as unknown as Record<string, unknown>).SpeechRecognition = originalSR;
    } else {
      delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    }
    if (originalWebkitSR !== undefined) {
      (window as unknown as Record<string, unknown>).webkitSpeechRecognition = originalWebkitSR;
    } else {
      delete (window as unknown as Record<string, unknown>).webkitSpeechRecognition;
    }
  });

  it("dictates Spanish text into Coach composer via Web Speech API and shows graceful fallback when unsupported", async () => {
    const user = userEvent.setup();
    MockSpeechRecognition.nextTranscript = "¿Qué dosis de creatina recomiendas?";
    const { unmount } = render(<App initialEntries={["/coach"]} />);

    const micBtn = await screen.findByRole("button", { name: /dictar por voz/i });
    await user.click(micBtn);

    const input = screen.getByLabelText(/mensaje para el coach/i) as HTMLTextAreaElement;
    expect(input.value).toContain("¿Qué dosis de creatina recomiendas?");

    await user.click(screen.getByRole("button", { name: /enviar/i }));
    expect(
      await screen.findByText(/la creatina monohidrato a 3-5 g\/día mejora fuerza/i),
    ).toBeInTheDocument();

    unmount();

    // Graceful fallback when SpeechRecognition is unavailable
    delete (window as unknown as Record<string, unknown>).SpeechRecognition;
    render(<App initialEntries={["/coach"]} />);
    const fallbackNotice = await screen.findByText(/dictado por voz no disponible/i);
    expect(fallbackNotice).toBeInTheDocument();
  });

  it("attaches an image in Coach chat, previews it, uploads it, and receives honest range analysis", async () => {
    const user = userEvent.setup();
    render(<App initialEntries={["/coach"]} />);

    const fileInput = (await screen.findByLabelText(/adjuntar imagen/i)) as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], "plato_pollo.png", {
      type: "image/png",
    });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(await screen.findByText(/plato_pollo\.png/i)).toBeInTheDocument();

    const input = screen.getByLabelText(/mensaje para el coach/i);
    await user.type(input, "Estima calorías de esta comida");
    await user.click(screen.getByRole("button", { name: /enviar/i }));

    expect(
      await screen.findByText(/500-620 kcal.*margen de incertidumbre/i),
    ).toBeInTheDocument();
    expect(getMockUploadedAttachments()).toHaveLength(1);
    expect(getMockUploadedAttachments()[0]?.media_type).toBe("image");
  });

  it("parses incomplete NL/voice Training Session into editable draft, flags missing load/RIR, and saves only on confirm", async () => {
    const user = userEvent.setup();
    MockSpeechRecognition.nextTranscript = "Hice 4 series de press banca a 8 repes";
    render(<App initialEntries={["/training"]} />);

    const sessionsTab = await screen.findByRole("button", { name: /^sesiones$/i });
    await user.click(sessionsTab);

    // Dictate incomplete training session
    const voiceBtn = await screen.findByRole("button", { name: /dictar sesión por voz/i });
    await user.click(voiceBtn);

    const nlInput = screen.getByLabelText(/describe tu sesión de entrenamiento/i) as HTMLTextAreaElement;
    expect(nlInput.value).toContain("Hice 4 series de press banca a 8 repes");

    await user.click(screen.getByRole("button", { name: /generar borrador/i }));

    // Draft highlights missing load & RIR without inventing or auto-persisting
    expect(await screen.findByText(/borrador de sesión de entrenamiento/i)).toBeInTheDocument();
    expect(await screen.findByText(/falta la carga/i)).toBeInTheDocument();
    expect(getMockParseNaturalCalls()).toHaveLength(1);

    // Fill missing load on the first set (or all sets) and explicitly confirm
    const loadInputs = screen.getAllByLabelText(/carga serie/i) as HTMLInputElement[];
    for (const loadInput of loadInputs) {
      await user.clear(loadInput);
      await user.type(loadInput, "80");
    }

    await user.click(screen.getByRole("button", { name: /confirmar y guardar sesión/i }));
    expect(
      await screen.findByText(/sesión de entrenamiento confirmada y guardada/i),
    ).toBeInTheDocument();
  });
});
