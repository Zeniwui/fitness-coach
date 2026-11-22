import { Plus } from "lucide-react";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { ModalDialog } from "../../ui/ModalDialog";
import { PageHeader } from "../../ui/PageHeader";
import { Surface } from "../../ui/Surface";
import { SessionDraftCard } from "../multimodal/SessionDraftCard";
import { CitationInspector } from "./CitationInspector";
import { CoachComposer } from "./CoachComposer";
import { CoachMessagesViewport } from "./CoachMessagesViewport";
import { ConversationThreadsBar } from "./ConversationThreadsBar";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { useCoachConversation } from "./useCoachConversation";

export function CoachPage() {
  const coach = useCoachConversation();

  function handleFocusComposer() {
    const composer = document.getElementById("coach-message-input");
    if (composer instanceof HTMLElement) {
      composer.focus();
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader
        title="Coach"
        description="Respaldado por tu Perfil Vivo activo y la Base de Conocimiento curada."
        action={
          <Button
            variant="soft"
            size="sm"
            onClick={() => void coach.handleNewConversation()}
            disabled={coach.streaming}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Nueva conversación</span>
          </Button>
        }
      />

      <OnboardingChecklist
        hasCoachMessages={coach.messages.length > 0}
        onFocusComposer={handleFocusComposer}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Conversation Column */}
        <div className="space-y-4 lg:col-span-8">
          {coach.errorMessage && <AlertBanner tone="error">{coach.errorMessage}</AlertBanner>}

          {coach.pendingProposals.map((proposal) => (
            <Surface key={proposal.id} variant="warning" padded="sm" className="space-y-2.5">
              <p className="text-xs font-semibold text-warning-text">
                Propuesta de actualización del Perfil Vivo
              </p>
              <p className="text-sm text-ink">{proposal.summary_es}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => void coach.handleAcceptProposal(proposal.id)}>
                  Aceptar actualización
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void coach.handleDismissProposal(proposal.id)}
                >
                  Descartar
                </Button>
              </div>
            </Surface>
          ))}

          {Object.entries(coach.proposalFeedback).map(([propId, msg]) => (
            <AlertBanner key={propId} tone="success">
              {msg}
            </AlertBanner>
          ))}

          <CoachMessagesViewport
            containerRef={coach.messagesContainerRef}
            loadingInitial={coach.loadingInitial}
            messages={coach.messages}
            streaming={coach.streaming}
            streamingDraft={coach.streamingDraft}
            showJumpToBottom={coach.showJumpToBottom}
            promotedUrls={coach.promotedUrls}
            promotingUrl={coach.promotingUrl}
            onScroll={coach.handleMessagesScroll}
            onJumpToBottom={coach.scrollToLatestMessage}
            onPickStarterPrompt={coach.setInputText}
            onSelectCitation={coach.setSelectedCitation}
            onPromoteLiveHit={(hit) => void coach.handlePromoteLiveHit(hit)}
          />

          {coach.pendingSessionDraft && (
            <SessionDraftCard
              draft={coach.pendingSessionDraft}
              onSaved={() => {
                coach.setPendingSessionDraft(null);
                coach.setDraftFeedback(
                  "Sesión de Entrenamiento confirmada y guardada en tu historial.",
                );
              }}
              onDiscard={() => coach.setPendingSessionDraft(null)}
            />
          )}

          {coach.draftFeedback && <AlertBanner tone="success">{coach.draftFeedback}</AlertBanner>}

          <CoachComposer
            inputText={coach.inputText}
            onInputTextChange={coach.setInputText}
            enableLiveSearch={coach.enableLiveSearch}
            onEnableLiveSearchChange={coach.setEnableLiveSearch}
            selectedImage={coach.selectedImage}
            imagePreviewUrl={coach.imagePreviewUrl}
            imageCategory={coach.imageCategory}
            onImageCategoryChange={coach.setImageCategory}
            onImageSelect={coach.handleImageSelect}
            onClearImage={coach.clearSelectedImage}
            onVoiceTranscript={coach.handleVoiceTranscript}
            streaming={coach.streaming}
            onSubmit={(e) => void coach.handleSend(e)}
          />
        </div>

        {/* Auxiliary Sidebar: Conversations & Desktop Evidence Citation Inspector */}
        <div className="space-y-4 lg:col-span-4">
          <ConversationThreadsBar
            conversations={coach.conversations}
            activeConvId={coach.activeConvId}
            busy={coach.streaming}
            onSelect={(id) => void coach.handleSelectConversation(id)}
            onRename={coach.handleRenameConversation}
            onDelete={coach.handleDeleteConversation}
          />

          <div className="hidden lg:block">
            {coach.selectedCitation ? (
              <CitationInspector
                citation={coach.selectedCitation}
                onClose={() => coach.setSelectedCitation(null)}
              />
            ) : (
              <Surface variant="inset" padded="sm" className="text-xs text-ink-muted">
                <p className="font-semibold text-ink">Inspector de evidencia</p>
                <p className="mt-1 leading-relaxed">
                  Selecciona cualquier Ficha de Evidencia citada por el Coach para consultar aquí su
                  nivel metodológico, vigencia y DOI sin perder el hilo.
                </p>
              </Surface>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Citation Inspector Bottom Sheet (accessible modal dialog) */}
      {coach.selectedCitation && (
        <ModalDialog
          placement="bottom-sheet"
          ariaLabel="Detalle de Ficha de Evidencia"
          onClose={() => coach.setSelectedCitation(null)}
          className="lg:hidden"
        >
          <CitationInspector
            citation={coach.selectedCitation}
            onClose={() => coach.setSelectedCitation(null)}
          />
        </ModalDialog>
      )}
    </section>
  );
}
