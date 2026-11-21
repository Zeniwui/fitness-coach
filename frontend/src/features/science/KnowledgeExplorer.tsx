import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";

type EvidenceSearchHit = components["schemas"]["EvidenceSearchHitResponse"];
type EvidenceLevel = components["schemas"]["EvidenceLevel"];
type ValidityStatus = components["schemas"]["ValidityStatus"];

const EVIDENCE_LEVEL_LABELS: Record<EvidenceLevel, string> = {
  meta_analysis: "Meta-análisis",
  systematic_review: "Revisión sistemática",
  position_stand: "Posicionamiento (ISSN/Consenso)",
  rct: "ECA (RCT)",
  controlled_trial: "Ensayo controlado",
  observational: "Observacional",
  mechanistic: "Mecanístico",
  preprint: "Preprint",
};

const VALIDITY_LABELS: Record<ValidityStatus, string> = {
  active: "Vigente",
  nuanced: "Matizada",
  superseded: "Superada",
  archived: "Archivada",
};

const VALIDITY_STYLES: Record<ValidityStatus, string> = {
  active: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  nuanced: "bg-amber-500/20 text-amber-200 border-amber-500/30",
  superseded: "bg-rose-500/20 text-rose-200 border-rose-500/30",
  archived: "bg-slate-700/60 text-slate-300 border-slate-600",
};

interface KnowledgeExplorerProps {
  isCurator: boolean;
}

export function KnowledgeExplorer({ isCurator }: KnowledgeExplorerProps) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [evidenceLevel, setEvidenceLevel] = useState<EvidenceLevel | "">("");
  const [validityStatus, setValidityStatus] = useState<ValidityStatus | "">("");
  const [hits, setHits] = useState<EvidenceSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editValidity, setEditValidity] = useState<ValidityStatus>("active");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const runSearch = useCallback(
    async (overrideQuery?: string) => {
      setLoading(true);
      setError(null);
      const qValue = (overrideQuery !== undefined ? overrideQuery : query).trim();
      const parsedTags = tagFilter
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      try {
        const { data, error: apiError } = await apiClient.GET("/api/v1/knowledge/search", {
          params: {
            query: {
              q: qValue || undefined,
              tags: parsedTags.length > 0 ? parsedTags : undefined,
              evidence_level: evidenceLevel || undefined,
              validity_status: validityStatus || undefined,
              limit: 20,
            },
          },
        });
        if (data) {
          setHits(data.items);
        } else {
          setError(
            typeof apiError === "object" && apiError && "detail" in apiError
              ? String((apiError as { detail: unknown }).detail)
              : "No se pudo consultar la Base de Conocimiento.",
          );
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error de conexión al buscar evidencia.",
        );
      } finally {
        setLoading(false);
      }
    },
    [query, tagFilter, evidenceLevel, validityStatus],
  );

  useEffect(() => {
    void runSearch("");
    // Initial load of approved EvidenceCards
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch();
  };

  const handleStartEdit = (hit: EvidenceSearchHit) => {
    setEditingCardId(hit.card.id);
    setEditNotes(hit.card.curator_notes || "");
    setEditValidity(hit.card.validity_status);
    setActionMessage(null);
  };

  const handleSaveCard = async (cardId: string) => {
    setActionMessage(null);
    const { data, error: apiError } = await apiClient.PATCH("/api/v1/curator/cards/{card_id}", {
      params: { path: { card_id: cardId } },
      body: {
        curator_notes: editNotes,
        validity_status: editValidity,
      },
    });
    if (data) {
      setEditingCardId(null);
      setActionMessage("Ficha de Evidencia actualizada.");
      await runSearch();
    } else {
      setError(
        typeof apiError === "object" && apiError && "detail" in apiError
          ? String((apiError as { detail: unknown }).detail)
          : "No se pudo actualizar la Ficha de Evidencia.",
      );
    }
  };

  return (
    <section className="space-y-4">
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/70 p-4"
      >
        <div>
          <label
            htmlFor="kb-search-input"
            className="mb-1 block text-xs font-medium text-slate-300"
          >
            Buscar Fichas de Evidencia (español, inglés o siglas como RIR, 1RM, HMB, ISSN, mTOR)
          </label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="kb-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej.: volumen semanal hipertrofia, RIR, creatina, mTOR…"
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400"
            >
              Buscar
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div>
            <label htmlFor="kb-tag-filter" className="mb-1 block text-[11px] text-slate-400">
              Etiquetas (separadas por coma)
            </label>
            <input
              id="kb-tag-filter"
              type="text"
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              placeholder="hipertrofia, volumen"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            />
          </div>

          <div>
            <label htmlFor="kb-level-filter" className="mb-1 block text-[11px] text-slate-400">
              Nivel de evidencia
            </label>
            <select
              id="kb-level-filter"
              value={evidenceLevel}
              onChange={(e) => setEvidenceLevel(e.target.value as EvidenceLevel | "")}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Todos los niveles</option>
              {(Object.keys(EVIDENCE_LEVEL_LABELS) as EvidenceLevel[]).map((lvl) => (
                <option key={lvl} value={lvl}>
                  {EVIDENCE_LEVEL_LABELS[lvl]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="kb-validity-filter" className="mb-1 block text-[11px] text-slate-400">
              Vigencia
            </label>
            <select
              id="kb-validity-filter"
              value={validityStatus}
              onChange={(e) => setValidityStatus(e.target.value as ValidityStatus | "")}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-white"
            >
              <option value="">Cualquier vigencia</option>
              {(Object.keys(VALIDITY_LABELS) as ValidityStatus[]).map((st) => (
                <option key={st} value={st}>
                  {VALIDITY_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/50 px-3 py-2 text-xs text-rose-200"
        >
          {error}
        </div>
      )}

      {actionMessage && (
        <div
          role="status"
          className="rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-3 py-2 text-xs text-emerald-200"
        >
          {actionMessage}
        </div>
      )}

      {loading ? (
        <p className="text-xs text-slate-400">Buscando Fichas de Evidencia…</p>
      ) : hits.length === 0 ? (
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
          No se encontraron Fichas de Evidencia para los criterios seleccionados.
        </div>
      ) : (
        <ul className="space-y-3">
          {hits.map((hit) => {
            const { card } = hit;
            return (
              <li
                key={card.id}
                className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-900/70 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${VALIDITY_STYLES[card.validity_status]}`}
                  >
                    {VALIDITY_LABELS[card.validity_status]}
                  </span>
                  <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
                    {EVIDENCE_LEVEL_LABELS[card.evidence_level]}
                  </span>
                  <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[11px] text-slate-300">
                    {card.coverage === "full_text" ? "Texto completo" : "Solo abstract"}
                  </span>
                </div>

                <h2 className="text-base font-semibold text-white">{card.title}</h2>
                <p className="text-sm leading-relaxed text-slate-200">{card.curated_text_es}</p>

                {hit.updated_by_cards.length > 0 && (
                  <div className="rounded-lg border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                    <span className="font-semibold">Actualizada por: </span>
                    {hit.updated_by_cards.map((u) => u.title).join(" · ")}
                  </div>
                )}

                {card.curator_notes && (
                  <p className="text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">Notas del Curador:</span>{" "}
                    {card.curator_notes}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {card.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded bg-slate-800 px-2 py-0.5 text-[11px] text-emerald-300"
                    >
                      #{tag}
                    </span>
                  ))}
                  {card.key_terms_en.map((term) => (
                    <span
                      key={term}
                      className="rounded border border-slate-700 px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      {term}
                    </span>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-2 text-xs">
                  <div className="flex items-center gap-3 text-slate-400">
                    {card.doi && <span>DOI: {card.doi}</span>}
                    {card.source_url && (
                      <a
                        href={card.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-emerald-400 hover:underline"
                      >
                        Abrir DOI / PubMed
                      </a>
                    )}
                  </div>

                  {isCurator && editingCardId !== card.id && (
                    <button
                      type="button"
                      onClick={() => handleStartEdit(hit)}
                      className="rounded-md border border-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-200 hover:border-emerald-500"
                    >
                      Editar notas / vigencia
                    </button>
                  )}
                </div>

                {isCurator && editingCardId === card.id && (
                  <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <label className="block text-xs text-slate-300">
                      Notas del Curador
                      <textarea
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                      />
                    </label>
                    <label className="block text-xs text-slate-300">
                      Vigencia
                      <select
                        value={editValidity}
                        onChange={(e) => setEditValidity(e.target.value as ValidityStatus)}
                        className="mt-1 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs text-white"
                      >
                        {(Object.keys(VALIDITY_LABELS) as ValidityStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {VALIDITY_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void handleSaveCard(card.id)}
                        className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-slate-950"
                      >
                        Guardar cambios
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCardId(null)}
                        className="rounded border border-slate-700 px-3 py-1 text-xs text-slate-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
