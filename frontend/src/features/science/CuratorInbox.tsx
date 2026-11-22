import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  apiClient,
  coldStartAwareFetch,
  DuplicateSubmissionError,
  extractApiErrorDetail,
} from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import { CandidateStudyCard } from "./CandidateStudyCard";
import { CuratorIntakeBar, type PriorRejectionConflict } from "./CuratorIntakeBar";

type CandidateStudy = components["schemas"]["CandidateStudyResponse"];
type CandidateStatus = components["schemas"]["CandidateStatus"];
type EvidenceLevel = components["schemas"]["EvidenceLevel"];
type RelationType = components["schemas"]["RelationType"];
type EvidenceRelationInput = components["schemas"]["EvidenceRelationInputSchema"];
type EvidenceCardSummary =
  components["schemas"]["KnowledgeSearchResponse"]["items"][number]["card"];

const STATUS_FILTERS: ReadonlyArray<[CandidateStatus, string]> = [
  ["pending", "Pendientes"],
  ["approved", "Aprobados"],
  ["rejected", "Rechazados"],
];

export function CuratorInbox() {
  const [statusFilter, setStatusFilter] = useState<CandidateStatus>("pending");
  const [candidates, setCandidates] = useState<CandidateStudy[]>([]);
  const [approvedCards, setApprovedCards] = useState<EvidenceCardSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyCandidateId, setBusyCandidateId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [doiInput, setDoiInput] = useState("");
  const [priorRejection, setPriorRejection] = useState<PriorRejectionConflict | null>(null);

  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [tagsById, setTagsById] = useState<Record<string, string>>({});
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});
  const [relationsById, setRelationsById] = useState<Record<string, EvidenceRelationInput[]>>({});
  const [draftRelTypeById, setDraftRelTypeById] = useState<Record<string, RelationType>>({});
  const [draftRelTargetById, setDraftRelTargetById] = useState<Record<string, string>>({});

  const loadApprovedCards = useCallback(async () => {
    const kbRes = await apiClient.GET("/api/v1/knowledge/search", {
      params: { query: { limit: 50 } },
    });
    if (kbRes.data) {
      setApprovedCards(kbRes.data.items.map((item) => item.card));
    }
  }, []);

  const loadCandidates = useCallback(
    async (preferredExpandedId?: string) => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: apiError } = await apiClient.GET("/api/v1/curator/candidates", {
          params: { query: { status: statusFilter } },
        });
        if (data) {
          setCandidates(data.items);
          setExpandedId((prev) => {
            if (preferredExpandedId && data.items.some((item) => item.id === preferredExpandedId)) {
              return preferredExpandedId;
            }
            if (prev && data.items.some((item) => item.id === prev)) {
              return prev;
            }
            return data.items[0]?.id ?? null;
          });
        } else {
          setError(extractApiErrorDetail(apiError, "No se pudo cargar la Bandeja del Curador."));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar Estudios Candidatos.");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter],
  );

  useEffect(() => {
    void loadApprovedCards();
  }, [loadApprovedCards]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const submitDoiProposal = async (doiOrUrl: string, allowReopen: boolean) => {
    setError(null);
    setFeedback(null);
    setPriorRejection(null);
    try {
      const { data, error: apiError, response } = await apiClient.POST(
        "/api/v1/curator/candidates/from-doi",
        {
          body: { doi_or_url: doiOrUrl.trim(), allow_reopen: allowReopen },
        },
      );
      if (data) {
        setDoiInput("");
        setFeedback(`Estudio Candidato añadido a la bandeja: ${data.title}`);
        await loadCandidates(data.id);
        return;
      }
      if (
        response.status === 409 &&
        typeof apiError === "object" &&
        apiError &&
        "detail" in apiError
      ) {
        const detail = (apiError as unknown as { detail: Record<string, unknown> }).detail;
        if (detail && typeof detail === "object" && detail.code === "previously_rejected") {
          setPriorRejection({
            doiOrUrl: doiOrUrl.trim(),
            priorTitle: String(detail.prior_title || doiOrUrl),
            priorReason: String(detail.prior_rejection_reason || "Sin motivo registrado"),
          });
          return;
        }
      }
      setError(
        extractApiErrorDetail(apiError, "No se pudo proponer el Estudio Candidato por DOI."),
      );
    } catch (err) {
      if (!(err instanceof DuplicateSubmissionError)) {
        setError("Error de conexión al proponer el Estudio Candidato.");
      }
    }
  };

  const handleDoiSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!doiInput.trim()) return;
    void submitDoiProposal(doiInput, false);
  };

  const handleProposeFromPdf = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFeedback(null);
    setPriorRejection(null);

    const formData = new FormData();
    formData.append("file", file);
    const res = await coldStartAwareFetch("/api/v1/curator/candidates/from-pdf", {
      method: "POST",
      body: formData,
    });
    e.target.value = "";
    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as { detail?: unknown } | null;
      const detail = errJson?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "No se pudo proponer el Estudio Candidato desde PDF.",
      );
      return;
    }
    const created = (await res.json()) as CandidateStudy;
    setFeedback(`Estudio Candidato añadido desde PDF: ${created.title}`);
    await loadCandidates(created.id);
  };

  const handleUploadCandidatePdf = async (
    candidateId: string,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyCandidateId(candidateId);
    setError(null);
    setFeedback(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await coldStartAwareFetch(
        `/api/v1/curator/candidates/${candidateId}/upload-pdf`,
        {
          method: "POST",
          body: formData,
        },
      );
      e.target.value = "";
      if (!res.ok) {
        const errJson = (await res.json().catch(() => null)) as { detail?: string } | null;
        setError(errJson?.detail || "Error al procesar el PDF del estudio.");
        return;
      }
      setFeedback("PDF procesado y ficha crítica de 6 bloques regenerada con texto completo.");
      await loadCandidates();
    } finally {
      setBusyCandidateId(null);
    }
  };

  const handleAddRelation = (candidateId: string) => {
    const targetCardId = draftRelTargetById[candidateId];
    if (!targetCardId) return;
    const relationType: RelationType = draftRelTypeById[candidateId] ?? "confirms";

    setRelationsById((prev) => {
      const current = prev[candidateId] ?? [];
      const alreadyExists = current.some(
        (r) => r.target_card_id === targetCardId && r.relation_type === relationType,
      );
      if (alreadyExists) return prev;
      return {
        ...prev,
        [candidateId]: [
          ...current,
          { target_card_id: targetCardId, relation_type: relationType, rationale: null },
        ],
      };
    });
    setDraftRelTargetById((prev) => ({ ...prev, [candidateId]: "" }));
  };

  const handleRemoveRelation = (candidateId: string, index: number) => {
    setRelationsById((prev) => ({
      ...prev,
      [candidateId]: (prev[candidateId] ?? []).filter((_, i) => i !== index),
    }));
  };

  const handleApprove = async (candidate: CandidateStudy) => {
    setBusyCandidateId(candidate.id);
    setError(null);
    setFeedback(null);
    const rawTags = tagsById[candidate.id] ?? candidate.critical_sheet.suggested_tags.join(", ");
    const parsedTags = rawTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    try {
      const { data, error: apiError } = await apiClient.POST(
        "/api/v1/curator/candidates/{candidate_id}/approve",
        {
          params: { path: { candidate_id: candidate.id } },
          body: {
            evidence_level: candidate.critical_sheet.suggested_evidence_level as EvidenceLevel,
            tags: parsedTags,
            curator_notes: notesById[candidate.id] || null,
            relations: relationsById[candidate.id] ?? [],
          },
        },
      );
      if (data) {
        setFeedback(`Ficha de Evidencia aprobada e indexada: ${data.title}`);
        await Promise.all([loadCandidates(), loadApprovedCards()]);
      } else {
        setError(extractApiErrorDetail(apiError, "No se pudo aprobar el Estudio Candidato."));
      }
    } catch (err) {
      if (!(err instanceof DuplicateSubmissionError)) {
        setError("Error de conexión al aprobar el Estudio Candidato.");
      }
    } finally {
      setBusyCandidateId(null);
    }
  };

  const handleReject = async (candidateId: string) => {
    setError(null);
    setFeedback(null);
    const reason = (rejectReasonById[candidateId] || "").trim();
    if (!reason) {
      setError("Debes indicar un motivo obligatorio para rechazar un Estudio Candidato.");
      return;
    }
    setBusyCandidateId(candidateId);
    try {
      const { data, error: apiError } = await apiClient.POST(
        "/api/v1/curator/candidates/{candidate_id}/reject",
        {
          params: { path: { candidate_id: candidateId } },
          body: { rejection_reason: reason },
        },
      );
      if (data) {
        setFeedback("Estudio Candidato rechazado y registrado para evitar duplicados.");
        await loadCandidates();
      } else {
        setError(extractApiErrorDetail(apiError, "No se pudo rechazar el Estudio Candidato."));
      }
    } catch (err) {
      if (!(err instanceof DuplicateSubmissionError)) {
        setError("Error de conexión al rechazar el Estudio Candidato.");
      }
    } finally {
      setBusyCandidateId(null);
    }
  };

  const handleReindex = async () => {
    setError(null);
    setFeedback(null);
    const { data, error: apiError } = await apiClient.POST("/api/v1/curator/reindex", {
      body: { force: false },
    });
    if (data) {
      setFeedback(
        `Re-indexación completada (${data.reindexed_count} actualizadas, ${data.skipped_count} sin cambios, modelo: ${data.embedding_model}).`,
      );
    } else {
      setError(
        extractApiErrorDetail(apiError, "No se pudo re-indexar la Base de Conocimiento."),
      );
    }
  };

  return (
    <section className="space-y-5">
      <CuratorIntakeBar
        doiInput={doiInput}
        priorRejection={priorRejection}
        onDoiInputChange={setDoiInput}
        onDoiSubmit={handleDoiSubmit}
        onReopenPriorRejection={(url) => void submitDoiProposal(url, true)}
        onProposeFromPdf={(e) => void handleProposeFromPdf(e)}
        onReindex={() => void handleReindex()}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Filtrar Estudios Candidatos" className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map(([st, label]) => {
            const isActive = statusFilter === st;
            return (
              <Button
                key={st}
                variant={isActive ? "primary" : "secondary"}
                size="sm"
                aria-pressed={isActive}
                onClick={() => setStatusFilter(st)}
              >
                <span>{label}</span>
                {isActive && !loading && (
                  <span className="tabular-nums opacity-85">({candidates.length})</span>
                )}
              </Button>
            );
          })}
        </div>

        {candidates.length > 1 && (
          <p className="text-xs text-ink-muted tabular-nums">
            Triaje enfocado: 1 ficha abierta a la vez ({candidates.length} en cola)
          </p>
        )}
      </div>

      {error && <AlertBanner tone="error">{error}</AlertBanner>}
      {feedback && <AlertBanner tone="success">{feedback}</AlertBanner>}

      {loading ? (
        <p role="status" className="text-sm text-ink-muted">
          Cargando Estudios Candidatos…
        </p>
      ) : candidates.length === 0 ? (
        <Surface variant="inset" padded="lg" className="text-center text-sm text-ink-muted">
          No hay Estudios Candidatos en esta vista.
        </Surface>
      ) : (
        <ul className="space-y-3">
          {candidates.map((cand, index) => (
            <CandidateStudyCard
              key={cand.id}
              cand={cand}
              positionLabel={`${index + 1}/${candidates.length}`}
              expanded={expandedId === cand.id}
              busy={busyCandidateId === cand.id}
              approvedCards={approvedCards}
              tagsValue={tagsById[cand.id] ?? cand.critical_sheet.suggested_tags.join(", ")}
              notesValue={notesById[cand.id] || ""}
              rejectReason={rejectReasonById[cand.id] || ""}
              relations={relationsById[cand.id] ?? []}
              draftRelType={draftRelTypeById[cand.id] ?? "confirms"}
              draftRelTarget={draftRelTargetById[cand.id] ?? ""}
              onToggleExpand={() =>
                setExpandedId((prev) => (prev === cand.id ? null : cand.id))
              }
              onTagsChange={(v) => setTagsById((prev) => ({ ...prev, [cand.id]: v }))}
              onNotesChange={(v) => setNotesById((prev) => ({ ...prev, [cand.id]: v }))}
              onRejectReasonChange={(v) =>
                setRejectReasonById((prev) => ({ ...prev, [cand.id]: v }))
              }
              onDraftRelTypeChange={(v) =>
                setDraftRelTypeById((prev) => ({ ...prev, [cand.id]: v }))
              }
              onDraftRelTargetChange={(v) =>
                setDraftRelTargetById((prev) => ({ ...prev, [cand.id]: v }))
              }
              onAddRelation={() => handleAddRelation(cand.id)}
              onRemoveRelation={(idx) => handleRemoveRelation(cand.id, idx)}
              onUploadPdf={(e) => void handleUploadCandidatePdf(cand.id, e)}
              onApprove={() => void handleApprove(cand)}
              onReject={() => void handleReject(cand.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
