import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { PageHeader } from "../../ui/PageHeader";
import { Surface } from "../../ui/Surface";
import { SessionDraftCard } from "../multimodal/SessionDraftCard";
import { ChatMessageCard } from "./ChatMessageCard";
import { CitationInspector } from "./CitationInspector";
import { CoachComposer, type ImageCategory } from "./CoachComposer";
import { ConversationThreadsBar } from "./ConversationThreadsBar";
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
  const [imageCategory, setImageCategory] = useState<ImageCategory>("meal");
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
          onToken: (delta) => setStreamingDraft((prev) => prev + delta),
          onCitations: () => {},
          onLiveSearchQuarantine: () => {},
          onProfileProposal: (proposal) => {
            setProposals((prev) => [proposal, ...prev.filter((p) => p.id !== proposal.id)]);
          },
          onSessionDraft: (draft) => setPendingSessionDraft(draft),
          onDone: (assistantMsg) => {
            setStreamingDraft("");
            setMessages((prev) => [...prev, assistantMsg]);
          },
          onError: (detail) => setErrorMessage(detail),
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
    <section className="space-y-6">
      <PageHeader
        title="Coach"
        description="Respaldado por tu Perfil Vivo activo y la Base de Conocimiento curada."
        action={
          <Button
            variant="soft"
            size="sm"
            onClick={() => void handleNewConversation()}
            disabled={streaming}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Nueva conversación</span>
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Conversation Column */}
        <div className="space-y-4 lg:col-span-8">
          {errorMessage && <AlertBanner tone="error">{errorMessage}</AlertBanner>}

          {pendingProposals.map((proposal) => (
            <Surface key={proposal.id} variant="warning" padded="sm" className="space-y-2.5">
              <p className="text-xs font-semibold text-warning-text">
                Propuesta de actualización del Perfil Vivo
              </p>
              <p className="text-sm text-ink">{proposal.summary_es}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void handleAcceptProposal(proposal.id)}>
                  Aceptar actualización
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void handleDismissProposal(proposal.id)}
                >
                  Descartar
                </Button>
              </div>
            </Surface>
          ))}

          {Object.entries(proposalFeedback).map(([propId, msg]) => (
            <AlertBanner key={propId} tone="success">
              {msg}
            </AlertBanner>
          ))}

          <div className="space-y-3.5">
            {messages.length === 0 && !streaming && (
              <Surface variant="inset" padded="lg" className="text-sm text-ink-muted">
                Pregunta a tu Coach sobre hipertrofia, fuerza, nutrición deportiva o ajustes de tu
                planificación.
              </Surface>
            )}

            {messages.map((msg) => (
              <ChatMessageCard
                key={msg.id}
                msg={msg}
                promotedUrls={promotedUrls}
                promotingUrl={promotingUrl}
                onSelectCitation={setSelectedCitation}
                onPromoteLiveHit={(hit) => void handlePromoteLiveHit(hit)}
              />
            ))}

            {streaming && (
              <article className="mr-2 space-y-2 rounded-panel border border-accent/40 bg-surface p-4 shadow-panel sm:mr-6">
                <p className="text-xs font-semibold text-accent-text">Coach escribiendo…</p>
                <p className="max-w-[72ch] whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {streamingDraft || "Analizando tu Perfil Vivo y la Base de Conocimiento…"}
                </p>
              </article>
            )}
          </div>

          {pendingSessionDraft && (
            <SessionDraftCard
              draft={pendingSessionDraft}
              onSaved={() => {
                setPendingSessionDraft(null);
                setDraftFeedback(
                  "Sesión de Entrenamiento confirmada y guardada en tu historial.",
                );
              }}
              onDiscard={() => setPendingSessionDraft(null)}
            />
          )}

          {draftFeedback && <AlertBanner tone="success">{draftFeedback}</AlertBanner>}

          <CoachComposer
            inputText={inputText}
            onInputTextChange={setInputText}
            enableLiveSearch={enableLiveSearch}
            onEnableLiveSearchChange={setEnableLiveSearch}
            selectedImage={selectedImage}
            imagePreviewUrl={imagePreviewUrl}
            imageCategory={imageCategory}
            onImageCategoryChange={setImageCategory}
            onImageSelect={handleImageSelect}
            onClearImage={clearSelectedImage}
            onVoiceTranscript={handleVoiceTranscript}
            streaming={streaming}
            onSubmit={(e) => void handleSend(e)}
          />
        </div>

        {/* Auxiliary Sidebar: Conversations & Evidence Citation Inspector */}
        <div className="space-y-4 lg:col-span-4">
          <ConversationThreadsBar
            conversations={conversations}
            activeConvId={activeConvId}
            onSelect={(id) => void handleSelectConversation(id)}
          />

          {selectedCitation ? (
            <CitationInspector
              citation={selectedCitation}
              onClose={() => setSelectedCitation(null)}
            />
          ) : (
            <Surface variant="inset" padded="sm" className="hidden text-xs text-ink-muted lg:block">
              <p className="font-semibold text-ink">Inspector de evidencia</p>
              <p className="mt-1 leading-relaxed">
                Selecciona cualquier Ficha de Evidencia citada por el Coach para consultar aquí su
                nivel metodológico, vigencia y DOI sin perder el hilo.
              </p>
            </Surface>
          )}
        </div>
      </div>
    </section>
  );
}
