import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { apiClient, getAuthToken } from "../../api/client";
import type { components } from "../../api/generated/schema";

type CandidateStudy = components["schemas"]["CandidateStudyResponse"];
type CandidateStatus = components["schemas"]["CandidateStatus"];
type EvidenceLevel = components["schemas"]["EvidenceLevel"];

interface PriorRejectionConflict {
  doiOrUrl: string;
  priorTitle: string;
  priorReason: string;
}

export function CuratorInbox() {
  const [statusFilter, setStatusFilter] = useState<CandidateStatus>("pending");
  const [candidates, setCandidates] = useState<CandidateStudy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Manual DOI proposal
  const [doiInput, setDoiInput] = useState("");
  const [priorRejection, setPriorRejection] = useState<PriorRejectionConflict | null>(null);

  // Per-candidate draft state for approve/reject
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const [tagsById, setTagsById] = useState<Record<string, string>>({});
  const [rejectReasonById, setRejectReasonById] = useState<Record<string, string>>({});

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: apiError } = await apiClient.GET("/api/v1/curator/candidates", {
        params: { query: { status: statusFilter } },
      });
      if (data) {
        setCandidates(data.items);
      } else {
        setError(
          typeof apiError === "object" && apiError && "detail" in apiError
            ? String((apiError as { detail: unknown }).detail)
            : "No se pudo cargar la Bandeja del Curador.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar Estudios Candidatos.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadCandidates();
  }, [loadCandidates]);

  const submitDoiProposal = async (doiOrUrl: string, allowReopen: boolean) => {
    setError(null);
    setFeedback(null);
    setPriorRejection(null);
    const { data, error: apiError, response } = await apiClient.POST(
      "/api/v1/curator/candidates/from-doi",
      {
        body: { doi_or_url: doiOrUrl.trim(), allow_reopen: allowReopen },
      },
    );
    if (data) {
      setDoiInput("");
      setFeedback(`Estudio Candidato añadido a la bandeja: ${data.title}`);
      await loadCandidates();
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
      typeof apiError === "object" && apiError && "detail" in apiError
        ? String((apiError as { detail: unknown }).detail)
        : "No se pudo proponer el Estudio Candidato por DOI.",
    );
  };

  const handleDoiSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!doiInput.trim()) return;
    void submitDoiProposal(doiInput, false);
  };

  const handleUploadCandidatePdf = async (
    candidateId: string,
    e: ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFeedback(null);

    const formData = new FormData();
    formData.append("file", file);
    const token = getAuthToken();
    const res = await fetch(`/api/v1/curator/candidates/${candidateId}/upload-pdf`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      body: formData,
    });
    if (!res.ok) {
      const errJson = (await res.json().catch(() => null)) as { detail?: string } | null;
      setError(errJson?.detail || "Error al procesar el PDF del estudio.");
      return;
    }
    setFeedback("PDF procesado y ficha crítica de 6 bloques regenerada con texto completo.");
    await loadCandidates();
  };

  const handleApprove = async (candidate: CandidateStudy) => {
    setError(null);
    setFeedback(null);
    const rawTags = tagsById[candidate.id] ?? candidate.critical_sheet.suggested_tags.join(", ");
    const parsedTags = rawTags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    const { data, error: apiError } = await apiClient.POST(
      "/api/v1/curator/candidates/{candidate_id}/approve",
      {
        params: { path: { candidate_id: candidate.id } },
        body: {
          evidence_level: candidate.critical_sheet.suggested_evidence_level as EvidenceLevel,
          tags: parsedTags,
          curator_notes: notesById[candidate.id] || null,
          relations: [],
        },
      },
    );
    if (data) {
      setFeedback(`Ficha de Evidencia aprobada e indexada: ${data.title}`);
      await loadCandidates();
    } else {
      setError(
        typeof apiError === "object" && apiError && "detail" in apiError
          ? String((apiError as { detail: unknown }).detail)
          : "No se pudo aprobar el Estudio Candidato.",
      );
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
      setError(
        typeof apiError === "object" && apiError && "detail" in apiError
          ? String((apiError as { detail: unknown }).detail)
          : "No se pudo rechazar el Estudio Candidato.",
      );
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
        typeof apiError === "object" && apiError && "detail" in apiError
          ? String((apiError as { detail: unknown }).detail)
          : "No se pudo re-indexar la Base de Conocimiento.",
      );
    }
  };

  return (
    <section className="space-y-4">
      <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-white">Bandeja del Curador</h2>
            <p className="text-xs text-slate-400">
              Propón Estudios Candidatos por DOI o PDF, audita la ficha crítica de 6 bloques y aprueba o rechaza antes de indexar.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleReindex()}
            className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-emerald-300 hover:border-emerald-500"
          >
            Re-indexar Base
          </button>
        </div>

        <form onSubmit={handleDoiSubmit} className="flex flex-col gap-2 sm:flex-row">
          <label htmlFor="curator-doi-input" className="sr-only">
            DOI o enlace del estudio
          </label>
          <input
            id="curator-doi-input"
            aria-label="DOI o enlace del estudio"
            type="text"
            value={doiInput}
            onChange={(e) => setDoiInput(e.target.value)}
            placeholder="Ej.: 10.1007/s40279-023-01880-x o https://doi.org/..."
            className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-500 px-4 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
          >
            Proponer por DOI
          </button>
        </form>

        {priorRejection && (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-950/40 p-3 text-xs text-amber-100"
          >
            <p className="font-semibold">
              Estudio rechazado anteriormente: {priorRejection.priorTitle}
            </p>
            <p>Motivo previo: {priorRejection.priorReason}</p>
            <button
              type="button"
              onClick={() => void submitDoiProposal(priorRejection.doiOrUrl, true)}
              className="rounded bg-amber-400 px-3 py-1 text-xs font-semibold text-slate-950"
            >
              Reabrir estudio
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-2">
        {(
          [
            ["pending", "Pendientes"],
            ["approved", "Aprobados"],
            ["rejected", "Rechazados"],
          ] as [CandidateStatus, string][]
        ).map(([st, label]) => (
          <button
            key={st}
            type="button"
            onClick={() => setStatusFilter(st)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              statusFilter === st
                ? "bg-emerald-500 text-slate-950"
                : "border border-slate-800 bg-slate-900 text-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {feedback && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
        >
          {feedback}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Cargando Estudios Candidatos…</p>
      ) : candidates.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
          No hay Estudios Candidatos en esta vista.
        </div>
      ) : (
        <ul className="space-y-4">
          {candidates.map((cand) => (
            <li
              key={cand.id}
              className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4"
            >
              {cand.paywall_warning && (
                <div className="rounded-lg border border-amber-400/50 bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200">
                  ⚠️ {cand.paywall_warning}
                </div>
              )}

              <div className="space-y-1">
                <h3 className="text-base font-semibold text-white">{cand.title}</h3>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {cand.journal && <span>{cand.journal}</span>}
                  {cand.published_year && <span>{cand.published_year}</span>}
                  {cand.doi && <span>DOI: {cand.doi}</span>}
                  {cand.source_url && (
                    <a
                      href={cand.source_url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-emerald-400 hover:underline"
                    >
                      Ver fuente original (DOI/PubMed)
                    </a>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 rounded-lg border border-slate-800 bg-slate-950/70 p-3 text-xs md:grid-cols-2">
                <div>
                  <p className="font-semibold text-emerald-300">1. Identificación y enlace</p>
                  <p className="text-slate-300">{cand.critical_sheet.block_1_identification}</p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-300">2. Diseño y nivel de evidencia</p>
                  <p className="text-slate-300">
                    {cand.critical_sheet.block_2_design_and_evidence_level}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-300">
                    3. Población, muestra (n) y protocolo
                  </p>
                  <p className="text-slate-300">
                    {cand.critical_sheet.block_3_population_and_protocol}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-300">
                    4. Hallazgos clave y aplicabilidad
                  </p>
                  <p className="text-slate-300">
                    {cand.critical_sheet.block_4_key_findings_and_applicability}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-300">
                    5. Limitaciones, sesgos y conflictos
                  </p>
                  <p className="text-slate-300">
                    {cand.critical_sheet.block_5_limitations_and_conflicts}
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-emerald-300">
                    6. Impacto frente a fichas existentes
                  </p>
                  <p className="text-slate-300">
                    {cand.critical_sheet.block_6_impact_vs_existing_kb}
                  </p>
                </div>
              </div>

              {cand.status === "pending" && (
                <div className="space-y-3 border-t border-slate-800 pt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-medium text-sky-300 hover:border-sky-500">
                      Subir PDF completo y re-analizar
                      <input
                        type="file"
                        accept="application/pdf"
                        onChange={(e) => void handleUploadCandidatePdf(cand.id, e)}
                        className="sr-only"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      type="text"
                      aria-label="Etiquetas para la Ficha de Evidencia"
                      value={
                        tagsById[cand.id] ?? cand.critical_sheet.suggested_tags.join(", ")
                      }
                      onChange={(e) =>
                        setTagsById((prev) => ({ ...prev, [cand.id]: e.target.value }))
                      }
                      placeholder="Etiquetas (ej.: hipertrofia, rir)"
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                    />
                    <input
                      type="text"
                      aria-label="Notas del Curador"
                      value={notesById[cand.id] || ""}
                      onChange={(e) =>
                        setNotesById((prev) => ({ ...prev, [cand.id]: e.target.value }))
                      }
                      placeholder="Notas prácticas del Curador (opcional)"
                      className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleApprove(cand)}
                      className="rounded-lg bg-emerald-500 px-3.5 py-1.5 text-xs font-semibold text-slate-950 hover:bg-emerald-400"
                    >
                      Aprobar Ficha
                    </button>

                    <input
                      type="text"
                      aria-label="Motivo de rechazo"
                      value={rejectReasonById[cand.id] || ""}
                      onChange={(e) =>
                        setRejectReasonById((prev) => ({ ...prev, [cand.id]: e.target.value }))
                      }
                      placeholder="Motivo obligatorio para rechazar…"
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => void handleReject(cand.id)}
                      className="rounded-lg border border-rose-500/50 bg-rose-500/15 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/25"
                    >
                      Rechazar estudio
                    </button>
                  </div>
                </div>
              )}

              {cand.status === "rejected" && cand.rejection_reason && (
                <p className="text-xs text-rose-300">
                  <span className="font-semibold">Motivo de rechazo:</span>{" "}
                  {cand.rejection_reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
