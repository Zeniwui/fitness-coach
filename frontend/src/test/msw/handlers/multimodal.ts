import { http, HttpResponse } from "msw";
import type { components } from "../../../api/generated/schema";

type AttachmentResponse = components["schemas"]["AttachmentResponse"];
type TrainingSessionDraftResponse = components["schemas"]["TrainingSessionDraftResponse"];
type ParseNaturalSessionRequest = components["schemas"]["ParseNaturalSessionRequest"];

let attachmentCounter = 0;
let uploadedAttachments: AttachmentResponse[] = [];
let parseCalls: ParseNaturalSessionRequest[] = [];

export function resetMockMultimodalState(): void {
  attachmentCounter = 0;
  uploadedAttachments = [];
  parseCalls = [];
}

export function getMockUploadedAttachments(): AttachmentResponse[] {
  return [...uploadedAttachments];
}

export function getMockParseNaturalCalls(): ParseNaturalSessionRequest[] {
  return [...parseCalls];
}

export const multimodalHandlers = [
  http.post("*/api/v1/multimodal/attachments", async ({ request }) => {
    let filename = "adjunto.png";
    let mimeType = "image/png";
    let sizeBytes = 128;
    let category: AttachmentResponse["category"] = "meal";

    try {
      const formData = await request.formData();
      const file = formData.get("file");
      const rawCat = formData.get("category");
      if (typeof rawCat === "string" && rawCat) {
        category = rawCat as AttachmentResponse["category"];
      }
      if (file instanceof File) {
        filename = file.name;
        mimeType = file.type || "image/png";
        sizeBytes = file.size;
      }
    } catch {
      // jsdom FormData + Node undici fetch compatibility fallback
    }

    attachmentCounter += 1;
    const created: AttachmentResponse = {
      id: `99000000-0000-0000-0000-00000000000${attachmentCounter}`,
      message_id: null,
      media_type: mimeType.startsWith("audio/") ? "audio" : "image",
      mime_type: mimeType,
      original_filename: filename,
      size_bytes: sizeBytes,
      category,
      created_at: "2026-11-21T12:30:00Z",
    };
    uploadedAttachments.push(created);
    return HttpResponse.json(created, { status: 201 });
  }),

  http.post("*/api/v1/multimodal/transcribe", () => {
    return HttpResponse.json({
      transcript: "Press inclinado mancuernas 3x8 con 32 kg a RIR 1",
      language: "es",
    });
  }),

  http.post("*/api/v1/training/sessions/parse-natural", async ({ request }) => {
    const body = (await request.json()) as ParseNaturalSessionRequest;
    parseCalls.push(body);
    const text = body.text.trim();
    const lowered = text.toLowerCase();
    const hasLoad = /\d+\s*(kg|lb)/i.test(text);
    const hasRir = /\brir\s*\d/i.test(text);

    const isPressBanca = lowered.includes("press banca");
    const exerciseName = isPressBanca ? "Press banca" : "Press inclinado mancuernas";
    const setCount = lowered.includes("4") ? 4 : 3;
    const loadVal = hasLoad ? (lowered.includes("80") ? 80 : 32) : null;
    const rirVal = hasRir ? (lowered.includes("rir 2") ? 2 : 1) : null;

    const missingFields: string[] = [];
    if (loadVal === null) missingFields.push("load");
    if (rirVal === null) missingFields.push("rir");

    const ambiguities: TrainingSessionDraftResponse["ambiguities"] = [];
    if (loadVal === null) {
      ambiguities.push({
        field: "load",
        set_index: 0,
        message_es: `Falta la carga (kg/lb) en '${exerciseName}'. Indica el peso antes de guardar.`,
      });
    }
    if (rirVal === null) {
      ambiguities.push({
        field: "rir",
        set_index: 0,
        message_es: `No se indicó RIR ni RPE en '${exerciseName}'. Puedes añadirlo o confirmarlo así.`,
      });
    }

    const sets: TrainingSessionDraftResponse["sets"] = Array.from({ length: setCount }, (_, i) => ({
      exercise_name: exerciseName,
      muscle_group: "pecho",
      set_order: i + 1,
      reps: 8,
      load: loadVal,
      unit: "kg",
      rir: rirVal,
      rpe: null,
      notes: null,
      missing_fields: [...missingFields],
    }));

    const draft: TrainingSessionDraftResponse = {
      session_date: body.session_date ?? "2026-11-21",
      name: "Sesión de Pecho",
      origin: body.origin ?? "chat_text",
      raw_text: text,
      fatigue_notes: lowered.includes("costó") ? text : null,
      sets,
      ambiguities,
      needs_confirmation: true,
    };
    return HttpResponse.json(draft);
  }),
];
