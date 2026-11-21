import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";
import { SessionDraftCard } from "../multimodal/SessionDraftCard";
import { VoiceDictationButton } from "../multimodal/VoiceDictationButton";
import {
  AttachmentItem,
  ChatMessageItem,
  CitationItem,
  ProfileProposalItem,
  QuarantinedLiveResultItem,
  SessionDraftItem,
  streamCoachMessage,
  uploadCoachAttachment,
} from "./sse";

type ConversationItem = components["schemas"]["ConversationResponse"];

const EVIDENCE_LEVEL_LABELS: Record<string, string> = {
  meta_analysis: "Meta-análisis",
  systematic_review: "Revisión sistemática",
  position_stand: "Posicionamiento (ISSN)",
  rct: "Ensayo clínico (RCT)",
  controlled_trial: "Ensayo controlado",
  observational: "Observacional",
  mechanistic: "Mecanístico",
  preprint: "Preprint",
};

const VALIDITY_LABELS: Record<string, string> = {
  active: "Vigente",
  nuanced: "Matizada",
  superseded: "Superada",
  archived: "Archivada",
};

export function CoachPage() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [proposals, setProposals] = useState<ProfileProposalItem[]>([]);

  const [inputText, setInputText] = useState("");
  const [enableLiveSearch, setEnableLiveSearch] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingDraft, setStreamingDraft] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedCitation, setSelectedCitation] = useState<CitationItem | null>(null);
  const [promotedUrls, setPromotedUrls] = useState<Record<string, boolean>>({});
  const [promotingUrl, setPromotingUrl] = useState<string | null>(null);
  const [proposalFeedback, setProposalFeedback] = useState<Record<string, string>>({});
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [imageCategory, setImageCategory] = useState<
    "meal" | "label_supplement" | "scale_tracker" | "general"
  >("meal");
  const [pendingSessionDraft, setPendingSessionDraft] = useState<SessionDraftItem | null>(null);
  const [draftFeedback, setDraftFeedback] = useState<string | null>(null);

  async function loadInitialState() {
    setErrorMessage(null);
    const [convRes, propRes] = await Promise.all([
      apiClient.GET("/api/v1/coach/conversations"),
      apiClient.GET("/api/v1/profile/proposals"),
    ]);

    if (propRes.data) {
      setProposals(propRes.data);
    }

    if (convRes.data && convRes.data.length > 0) {
      setConversations(convRes.data);
      const firstId = convRes.data[0].id;
      setActiveConvId(firstId);
      const msgRes = await apiClient.GET("/api/v1/coach/conversations/{conversation_id}/messages", {
        params: { path: { conversation_id: firstId } },
      });
      if (msgRes.data) {
        setMessages(msgRes.data);
      }
      return;
    }

    const created = await apiClient.POST("/api/v1/coach/conversations", {
      body: { title: "Nueva conversación" },
    });
    if (created.data) {
      setConversations([created.data]);
      setActiveConvId(created.data.id);
      setMessages([]);
    }
  }

  useEffect(() => {
    void loadInitialState();
  }, []);

  async function handleSelectConversation(convId: string) {
    setActiveConvId(convId);
    setSelectedCitation(null);
    const msgRes = await apiClient.GET("/api/v1/coach/conversations/{conversation_id}/messages", {
      params: { path: { conversation_id: convId } },
    });
    if (msgRes.data) {
      setMessages(msgRes.data);
    }
  }

  async function handleNewConversation() {
    if (streaming) return;
    const created = await apiClient.POST("/api/v1/coach/conversations", {
      body: { title: "Nueva conversación" },
    });
    if (created.data) {
      setConversations((prev) => [created.data!, ...prev]);
      setActiveConvId(created.data.id);
      setMessages([]);
      setSelectedCitation(null);
    }
  }

  function handleImageSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    if (imagePreviewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImage(file);
    if (file && typeof URL.createObjectURL === "function") {
      setImagePreviewUrl(URL.createObjectURL(file));
    } else {
      setImagePreviewUrl(null);
    }
    e.target.value = "";
  }

  function clearSelectedImage() {
    if (imagePreviewUrl && typeof URL.revokeObjectURL === "function") {
      URL.revokeObjectURL(imagePreviewUrl);
    }
    setSelectedImage(null);
    setImagePreviewUrl(null);
  }

  function handleVoiceTranscript(transcript: string) {
    setInputText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const cleaned = inputText.trim();
    if (!cleaned || streaming) return;

    let convId = activeConvId;
    if (!convId) {
      const created = await apiClient.POST("/api/v1/coach/conversations", {
        body: { title: cleaned.slice(0, 60) },
      });
      if (!created.data) {
        setErrorMessage("No se pudo iniciar la conversación con el Coach.");
        return;
      }
      convId = created.data.id;
      setConversations((prev) => [created.data!, ...prev]);
      setActiveConvId(convId);
    }

    setErrorMessage(null);
    setDraftFeedback(null);

    let uploadedAttachment: AttachmentItem | null = null;
    if (selectedImage) {
      try {
        uploadedAttachment = await uploadCoachAttachment(selectedImage, imageCategory);
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "No se pudo subir la imagen adjunta.",
        );
        return;
      }
    }

    setInputText("");
    clearSelectedImage();
    setStreaming(true);
    setStreamingDraft("");

    const optimisticUserMsg: ChatMessageItem = {
      id: `local-user-${Date.now()}`,
      conversation_id: convId,
      role: "user",
      content: cleaned,
      citations: [],
      live_search_results: [],
      attachments: uploadedAttachment ? [uploadedAttachment] : [],
      used_general_knowledge: false,
      boundary_triggered: "none",
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticUserMsg]);

    try {
      await streamCoachMessage(
        convId,
        {
          content: cleaned,
          enable_live_search: enableLiveSearch,
          attachment_ids: uploadedAttachment ? [uploadedAttachment.id] : [],
        },
        {
          onToken: (delta) => {
            setStreamingDraft((prev) => prev + delta);
          },
          onCitations: () => {
            // Final persisted citations arrive on `done`
          },
          onLiveSearchQuarantine: () => {
            // Final persisted live search results arrive on `done`
          },
          onProfileProposal: (proposal) => {
            setProposals((prev) => [proposal, ...prev.filter((p) => p.id !== proposal.id)]);
          },
          onSessionDraft: (draft) => {
            setPendingSessionDraft(draft);
          },
          onDone: (assistantMsg) => {
            setStreamingDraft("");
            setMessages((prev) => [...prev, assistantMsg]);
          },
          onError: (detail) => {
            setErrorMessage(detail);
          },
        },
      );
    } catch {
      setErrorMessage("Error de conexión durante el streaming con el Coach.");
    } finally {
      setStreaming(false);
    }
  }

  async function handlePromoteLiveHit(hit: QuarantinedLiveResultItem) {
    if (promotingUrl || promotedUrls[hit.url]) return;
    setPromotingUrl(hit.url);
    setErrorMessage(null);
    try {
      const res = await apiClient.POST("/api/v1/coach/live-search/promote", {
        body: {
          title: hit.title,
          url: hit.url,
          snippet: hit.snippet,
          doi: hit.doi ?? null,
          pmid: hit.pmid ?? null,
          published_year: hit.published_year ?? null,
        },
      });
      if (res.data) {
        setPromotedUrls((prev) => ({ ...prev, [hit.url]: true }));
      } else {
        setErrorMessage("No se pudo enviar el estudio a la Bandeja del Curador.");
      }
    } finally {
      setPromotingUrl(null);
    }
  }

  async function handleAcceptProposal(proposalId: string) {
    const res = await apiClient.POST("/api/v1/profile/proposals/{proposal_id}/accept", {
      params: { path: { proposal_id: proposalId } },
    });
    if (res.data) {
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? res.data! : p)));
      setProposalFeedback((prev) => ({
        ...prev,
        [proposalId]: "Perfil Vivo actualizado correctamente.",
      }));
    }
  }

  async function handleDismissProposal(proposalId: string) {
    const res = await apiClient.POST("/api/v1/profile/proposals/{proposal_id}/dismiss", {
      params: { path: { proposal_id: proposalId } },
    });
    if (res.data) {
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? res.data! : p)));
      setProposalFeedback((prev) => ({
        ...prev,
        [proposalId]: "Propuesta descartada sin modificar tu Perfil Vivo.",
      }));
    }
  }

  const pendingProposals = proposals.filter((p) => p.status === "proposed");

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white">Coach</h1>
          <p className="text-xs text-slate-400">
            Respaldado por tu Perfil Vivo activo y la Base de Conocimiento curada.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleNewConversation()}
          disabled={streaming}
          className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50"
        >
          + Nueva conversación
        </button>
      </div>

      {/* Thread switcher */}
      {conversations.length > 0 && (
        <div
          aria-label="Hilos de conversación"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {conversations.map((conv) => {
            const isActive = conv.id === activeConvId;
            return (
              <button
                key={conv.id}
                type="button"
                onClick={() => void handleSelectConversation(conv.id)}
                className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition ${
                  isActive
                    ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                    : "border-slate-700 bg-slate-900 text-slate-300 hover:border-slate-500"
                }`}
              >
                {conv.title}
              </button>
            );
          })}
        </div>
      )}

      {errorMessage && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-xs text-rose-200"
        >
          {errorMessage}
        </div>
      )}

      {/* Pending Living Profile update proposals */}
      {pendingProposals.map((proposal) => (
        <div
          key={proposal.id}
          className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-950/30 p-3"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-300">
            Propuesta de actualización del Perfil Vivo
          </p>
          <p className="text-sm text-amber-100">{proposal.summary_es}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleAcceptProposal(proposal.id)}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Aceptar actualización
            </button>
            <button
              type="button"
              onClick={() => void handleDismissProposal(proposal.id)}
              className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-slate-400"
            >
              Descartar
            </button>
          </div>
        </div>
      ))}

      {Object.entries(proposalFeedback).map(([propId, msg]) => (
        <p
          key={propId}
          className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
        >
          {msg}
        </p>
      ))}

      {/* Conversation messages */}
      <div className="space-y-3">
        {messages.length === 0 && !streaming && (
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-sm text-slate-400">
            Pregunta a tu Coach sobre hipertrofia, fuerza, nutrición deportiva o ajustes de tu
            planificación.
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.role === "user";
          return (
            <article
              key={msg.id}
              className={`space-y-2 rounded-xl border p-3.5 ${
                isUser
                  ? "ml-6 border-emerald-500/30 bg-emerald-950/30 text-emerald-50"
                  : "mr-4 border-slate-800 bg-slate-900/80 text-slate-100"
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {isUser ? "Atleta" : "Coach"}
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</p>

              {/* Attached image badges */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {msg.attachments.map((att) => (
                    <span
                      key={att.id}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-slate-950/70 px-2 py-0.5 text-[11px] text-emerald-200"
                    >
                      Imagen adjunta: {att.original_filename ?? "imagen"}
                    </span>
                  ))}
                </div>
              )}

              {/* General knowledge disclosure badge */}
              {!isUser && msg.used_general_knowledge && (
                <p className="inline-block rounded-md border border-sky-500/30 bg-sky-950/50 px-2 py-1 text-[11px] text-sky-200">
                  Respuesta basada en conocimiento general (sin Ficha de Evidencia aprobada).
                </p>
              )}

              {/* Clickable EvidenceCard citation chips */}
              {!isUser && msg.citations && msg.citations.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold text-emerald-300">
                    Fichas de Evidencia citadas:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {msg.citations.map((cit) => (
                      <button
                        key={cit.card_id}
                        type="button"
                        onClick={() => setSelectedCitation(cit)}
                        className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-2.5 py-1 text-left text-xs text-emerald-200 hover:bg-emerald-900/60"
                      >
                        <span className="font-semibold">{cit.title}</span>{" "}
                        <span className="text-[10px] text-emerald-300/90">
                          [{EVIDENCE_LEVEL_LABELS[cit.evidence_level] ?? cit.evidence_level} ·{" "}
                          {VALIDITY_LABELS[cit.validity_status] ?? cit.validity_status}]
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quarantined live search banner + 1-click promote */}
              {!isUser && msg.live_search_results && msg.live_search_results.length > 0 && (
                <div className="space-y-2 rounded-lg border border-amber-500/50 bg-amber-950/40 p-3">
                  <p className="text-xs font-semibold text-amber-300">
                    Cuarentena: fuente externa aún no verificada en Base de Conocimiento
                  </p>
                  {msg.live_search_results.map((hit) => {
                    const isPromoted = Boolean(promotedUrls[hit.url]);
                    return (
                      <div
                        key={hit.url}
                        className="space-y-1.5 rounded-md border border-amber-500/30 bg-slate-950/60 p-2.5"
                      >
                        <p className="text-xs font-semibold text-white">{hit.title}</p>
                        <p className="text-xs text-slate-300">{hit.snippet}</p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <a
                            href={hit.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-amber-300 underline"
                          >
                            Ver fuente externa
                          </a>
                          {isPromoted ? (
                            <span className="rounded bg-emerald-500/20 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                              Enviado como Estudio Candidato pendiente
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={promotingUrl === hit.url}
                              onClick={() => void handlePromoteLiveHit(hit)}
                              className="rounded-md bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                            >
                              Enviar a Estudios Candidatos
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}

        {streaming && (
          <article className="mr-4 space-y-1 rounded-xl border border-emerald-500/40 bg-slate-900/90 p-3.5 text-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              Coach escribiendo…
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {streamingDraft || "Analizando tu Perfil Vivo y la Base de Conocimiento…"}
            </p>
          </article>
        )}
      </div>

      {/* Selected citation detail card */}
      {selectedCitation && (
        <aside className="space-y-1.5 rounded-xl border border-emerald-500/40 bg-slate-900 p-3.5 text-xs text-slate-200">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-emerald-300">{selectedCitation.title}</p>
            <button
              type="button"
              onClick={() => setSelectedCitation(null)}
              className="text-slate-400 hover:text-white"
            >
              Cerrar
            </button>
          </div>
          <p>
            Nivel:{" "}
            {EVIDENCE_LEVEL_LABELS[selectedCitation.evidence_level] ??
              selectedCitation.evidence_level}{" "}
            · Estado:{" "}
            {VALIDITY_LABELS[selectedCitation.validity_status] ?? selectedCitation.validity_status}
          </p>
          {selectedCitation.doi && <p>DOI: {selectedCitation.doi}</p>}
          {selectedCitation.superseded_by_title && (
            <p className="text-amber-300">
              Actualizada por: {selectedCitation.superseded_by_title}
            </p>
          )}
        </aside>
      )}

      {/* Inline editable Training Session draft detected in Coach chat */}
      {pendingSessionDraft && (
        <SessionDraftCard
          draft={pendingSessionDraft}
          onSaved={() => {
            setPendingSessionDraft(null);
            setDraftFeedback("Sesión de Entrenamiento confirmada y guardada en tu historial.");
          }}
          onDiscard={() => setPendingSessionDraft(null)}
        />
      )}

      {draftFeedback && (
        <p
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-200"
        >
          {draftFeedback}
        </p>
      )}

      {/* Composer */}
      <form
        onSubmit={(e) => void handleSend(e)}
        className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/80 p-3"
      >
        <label htmlFor="coach-message-input" className="block text-xs font-medium text-slate-300">
          Mensaje para el Coach
        </label>
        <textarea
          id="coach-message-input"
          rows={2}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Escribe o dicta tu consulta, una Sesión de Entrenamiento o adjunta una foto…"
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder-slate-500 focus:border-emerald-400 focus:outline-none"
        />

        {/* Selected image preview */}
        {selectedImage && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-slate-950/80 p-2">
            <div className="flex items-center gap-2">
              {imagePreviewUrl && (
                <img
                  src={imagePreviewUrl}
                  alt="Vista previa de imagen adjunta"
                  className="h-10 w-10 rounded object-cover"
                />
              )}
              <div className="text-xs">
                <p className="font-medium text-emerald-200">{selectedImage.name}</p>
                <label className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-400">
                  Tipo:
                  <select
                    value={imageCategory}
                    onChange={(e) =>
                      setImageCategory(
                        e.target.value as "meal" | "label_supplement" | "scale_tracker" | "general",
                      )
                    }
                    className="rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 text-[11px] text-white"
                  >
                    <option value="meal">Comida</option>
                    <option value="label_supplement">Etiqueta / suplemento</option>
                    <option value="scale_tracker">Báscula / app</option>
                    <option value="general">General</option>
                  </select>
                </label>
              </div>
            </div>
            <button
              type="button"
              onClick={clearSelectedImage}
              aria-label="Quitar imagen adjunta"
              className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {/* Multimodal toolbar: Voice dictation + Image picker */}
        <div className="flex flex-wrap items-center gap-2">
          <VoiceDictationButton onTranscript={handleVoiceTranscript} disabled={streaming} />
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-emerald-400 hover:text-emerald-200">
            <ImagePlus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Adjuntar imagen</span>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleImageSelect}
              disabled={streaming}
              className="sr-only"
            />
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={enableLiveSearch}
              onChange={(e) => setEnableLiveSearch(e.target.checked)}
              className="rounded border-slate-600 bg-slate-950 text-emerald-500"
            />
            Búsqueda en vivo (cuarentena)
          </label>
          <button
            type="submit"
            disabled={streaming || !inputText.trim()}
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {streaming ? "Respondiendo…" : "Enviar"}
          </button>
        </div>
      </form>
    </section>
  );
}
