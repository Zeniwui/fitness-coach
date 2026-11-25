import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { apiClient, extractApiErrorDetail } from "../../api/client";
import type { components } from "../../api/generated/schema";
import type { ImageCategory } from "./CoachComposer";
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

export type ConversationItem = components["schemas"]["ConversationResponse"];

export function useCoachConversation() {
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
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
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    async function loadInitialState() {
      setLoadingInitial(true);
      setErrorMessage(null);
      try {
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
          const msgRes = await apiClient.GET(
            "/api/v1/coach/conversations/{conversation_id}/messages",
            {
              params: { path: { conversation_id: firstId } },
            },
          );
          if (msgRes.data) {
            setMessages(msgRes.data);
          }
        }
      } finally {
        setLoadingInitial(false);
      }
    }

    void loadInitialState();
  }, []);

  useEffect(() => {
    const el = messagesContainerRef.current;
    if (!el || !shouldAutoScrollRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [messages.length, streamingDraft, streaming]);

  useEffect(() => {
    return () => {
      if (imagePreviewUrl && typeof URL.revokeObjectURL === "function") {
        URL.revokeObjectURL(imagePreviewUrl);
      }
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (!selectedCitation) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setSelectedCitation(null);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedCitation]);

  function handleMessagesScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom <= 48;
    shouldAutoScrollRef.current = nearBottom;
    setShowJumpToBottom(!nearBottom);
  }

  function scrollToLatestMessage() {
    const el = messagesContainerRef.current;
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }

  async function handleSelectConversation(convId: string) {
    setActiveConvId(convId);
    setSelectedCitation(null);
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);
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
      shouldAutoScrollRef.current = true;
      setShowJumpToBottom(false);
    }
  }

  async function handleRenameConversation(convId: string, title: string): Promise<boolean> {
    setErrorMessage(null);
    const res = await apiClient.PATCH("/api/v1/coach/conversations/{conversation_id}", {
      params: { path: { conversation_id: convId } },
      body: { title },
    });
    if (res.data) {
      const updated = res.data;
      setConversations((prev) => prev.map((c) => (c.id === convId ? updated : c)));
      return true;
    }
    setErrorMessage(
      extractApiErrorDetail(res.error, "No se pudo renombrar la conversación."),
    );
    return false;
  }

  async function handleDeleteConversation(convId: string): Promise<void> {
    if (streaming) return;
    setErrorMessage(null);
    const res = await apiClient.DELETE("/api/v1/coach/conversations/{conversation_id}", {
      params: { path: { conversation_id: convId } },
    });
    if (res.error) {
      setErrorMessage(
        extractApiErrorDetail(res.error, "No se pudo eliminar la conversación."),
      );
      return;
    }
    const remaining = conversations.filter((c) => c.id !== convId);
    setConversations(remaining);
    if (activeConvId === convId) {
      setSelectedCitation(null);
      if (remaining.length > 0) {
        await handleSelectConversation(remaining[0].id);
      } else {
        setActiveConvId(null);
        setMessages([]);
      }
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

    // Resume auto-scroll whenever the Athlete explicitly submits a new prompt.
    shouldAutoScrollRef.current = true;
    setShowJumpToBottom(false);

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

    let completed = false;
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
            completed = true;
            setStreamingDraft("");
            setMessages((prev) => [...prev, assistantMsg]);
          },
          onError: (detail) => {
            setErrorMessage(detail);
            setInputText((curr) => curr || cleaned);
          },
        },
      );
    } catch {
      setErrorMessage("Error de conexión durante la respuesta del Coach. Tu mensaje se ha recuperado.");
      if (!completed) {
        setInputText((curr) => curr || cleaned);
      }
    } finally {
      setStreaming(false);
    }
  }

  async function handlePromoteLiveHit(messageId: string, hit: QuarantinedLiveResultItem) {
    if (promotingUrl || promotedUrls[hit.url]) return;
    setPromotingUrl(hit.url);
    setErrorMessage(null);
    try {
      const res = await apiClient.POST("/api/v1/coach/live-search/promote", {
        body: {
          message_id: messageId,
          result_url: hit.url,
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
    setErrorMessage(null);
    const res = await apiClient.POST("/api/v1/profile/proposals/{proposal_id}/accept", {
      params: { path: { proposal_id: proposalId } },
    });
    if (res.data) {
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? res.data! : p)));
      setProposalFeedback((prev) => ({
        ...prev,
        [proposalId]: "Perfil Vivo actualizado correctamente.",
      }));
    } else {
      setErrorMessage(
        extractApiErrorDetail(res.error, "No se pudo aceptar la propuesta de actualización."),
      );
    }
  }

  async function handleDismissProposal(proposalId: string) {
    setErrorMessage(null);
    const res = await apiClient.POST("/api/v1/profile/proposals/{proposal_id}/dismiss", {
      params: { path: { proposal_id: proposalId } },
    });
    if (res.data) {
      setProposals((prev) => prev.map((p) => (p.id === proposalId ? res.data! : p)));
      setProposalFeedback((prev) => ({
        ...prev,
        [proposalId]: "Propuesta descartada sin modificar tu Perfil Vivo.",
      }));
    } else {
      setErrorMessage(
        extractApiErrorDetail(res.error, "No se pudo descartar la propuesta de actualización."),
      );
    }
  }

  return {
    conversations,
    loadingInitial,
    activeConvId,
    messages,
    pendingProposals: proposals.filter((p) => p.status === "proposed"),
    inputText,
    setInputText,
    enableLiveSearch,
    setEnableLiveSearch,
    streaming,
    streamingDraft,
    errorMessage,
    selectedCitation,
    setSelectedCitation,
    promotedUrls,
    promotingUrl,
    proposalFeedback,
    selectedImage,
    imagePreviewUrl,
    imageCategory,
    setImageCategory,
    pendingSessionDraft,
    setPendingSessionDraft,
    draftFeedback,
    setDraftFeedback,
    showJumpToBottom,
    messagesContainerRef,
    handleMessagesScroll,
    scrollToLatestMessage,
    handleSelectConversation,
    handleNewConversation,
    handleRenameConversation,
    handleDeleteConversation,
    handleImageSelect,
    clearSelectedImage,
    handleVoiceTranscript,
    handleSend,
    handlePromoteLiveHit,
    handleAcceptProposal,
    handleDismissProposal,
  };
}
