import { coldStartAwareFetch } from "../../api/client";
import type { components } from "../../api/generated/schema";

export type CitationItem = components["schemas"]["CitationResponse"];
export type QuarantinedLiveResultItem = components["schemas"]["QuarantinedLiveResultResponse"];
export type ChatMessageItem = components["schemas"]["ChatMessageResponse"];
export type ProfileProposalItem = components["schemas"]["ProfileProposalResponse"];
export type AttachmentItem = components["schemas"]["AttachmentResponse"];
export type SessionDraftItem = components["schemas"]["TrainingSessionDraftResponse"];

export interface CoachStreamCallbacks {
  onToken: (delta: string) => void;
  onCitations: (payload: {
    citations: CitationItem[];
    used_general_knowledge: boolean;
    boundary_triggered: string;
  }) => void;
  onLiveSearchQuarantine: (payload: {
    quarantine_label: string;
    results: QuarantinedLiveResultItem[];
  }) => void;
  onProfileProposal: (proposal: ProfileProposalItem) => void;
  onSessionDraft?: (draft: SessionDraftItem) => void;
  onDone: (message: ChatMessageItem) => void;
  onError: (detail: string) => void;
}

function getBaseUrl(): string {
  return (
    import.meta.env.VITE_API_BASE_URL ||
    (typeof window !== "undefined" && window.location?.origin
      ? window.location.origin
      : "http://localhost:5173")
  );
}

function dispatchSseBlock(rawBlock: string, callbacks: CoachStreamCallbacks): void {
  const lines = rawBlock.split(/\r?\n/);
  let eventName = "message";
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  } catch {
    return;
  }

  if (eventName === "token" && typeof parsed.delta === "string") {
    callbacks.onToken(parsed.delta);
  } else if (eventName === "citations") {
    callbacks.onCitations({
      citations: (parsed.citations as CitationItem[]) ?? [],
      used_general_knowledge: Boolean(parsed.used_general_knowledge),
      boundary_triggered: String(parsed.boundary_triggered ?? "none"),
    });
  } else if (eventName === "live_search_quarantine") {
    callbacks.onLiveSearchQuarantine({
      quarantine_label: String(
        parsed.quarantine_label ?? "fuente externa aún no verificada en Base de Conocimiento",
      ),
      results: (parsed.results as QuarantinedLiveResultItem[]) ?? [],
    });
  } else if (eventName === "profile_proposal" && parsed.proposal) {
    callbacks.onProfileProposal(parsed.proposal as ProfileProposalItem);
  } else if (eventName === "session_draft" && parsed.draft) {
    callbacks.onSessionDraft?.(parsed.draft as SessionDraftItem);
  } else if (eventName === "done" && parsed.message) {
    callbacks.onDone(parsed.message as ChatMessageItem);
  } else if (eventName === "error") {
    callbacks.onError(String(parsed.detail ?? "Error inesperado durante la respuesta del Coach."));
  }
}

export async function uploadCoachAttachment(
  file: File,
  category: "meal" | "label_supplement" | "scale_tracker" | "general" = "general",
): Promise<AttachmentItem> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("category", category);

  const response = await coldStartAwareFetch(`${getBaseUrl()}/api/v1/multimodal/attachments`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    let detail = "No se pudo subir la imagen adjunta.";
    try {
      const errJson = (await response.json()) as { detail?: string };
      if (errJson.detail) detail = errJson.detail;
    } catch {
      // keep default
    }
    throw new Error(detail);
  }
  return (await response.json()) as AttachmentItem;
}

export async function streamCoachMessage(
  conversationId: string,
  payload: { content: string; enable_live_search: boolean; attachment_ids?: string[] },
  callbacks: CoachStreamCallbacks,
): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };

  const response = await coldStartAwareFetch(
    `${getBaseUrl()}/api/v1/coach/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    },
  );

  if (!response.ok) {
    let detail = "No se pudo enviar el mensaje al Coach.";
    try {
      const errJson = (await response.json()) as { detail?: string };
      if (errJson.detail) {
        detail = errJson.detail;
      }
    } catch {
      // keep default message
    }
    callbacks.onError(detail);
    return;
  }

  if (!response.body) {
    const raw = await response.text();
    for (const block of raw.split(/\r?\n\r?\n/)) {
      if (block.trim()) {
        dispatchSseBlock(block, callbacks);
      }
    }
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop() ?? "";
    for (const block of parts) {
      if (block.trim()) {
        dispatchSseBlock(block, callbacks);
      }
    }
  }

  if (buffer.trim()) {
    dispatchSseBlock(buffer, callbacks);
  }
}
