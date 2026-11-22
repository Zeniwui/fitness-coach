import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ExternalLink, Search, SlidersHorizontal, X } from "lucide-react";
import { apiClient, extractApiErrorDetail } from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Badge } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input, Select, Textarea } from "../../ui/Field";
import { Surface } from "../../ui/Surface";
import {
  EVIDENCE_LEVEL_LABELS,
  VALIDITY_LABELS,
  VALIDITY_TONES,
  type EvidenceLevel,
  type ValidityStatus,
} from "./labels";

type EvidenceSearchHit = components["schemas"]["EvidenceSearchHitResponse"];

const QUICK_QUERIES = ["RIR", "creatina", "volumen", "hipertrofia"] as const;

interface SearchCriteria {
  query: string;
  tagFilter: string;
  evidenceLevel: EvidenceLevel | "";
  validityStatus: ValidityStatus | "";
}

interface KnowledgeExplorerProps {
  isCurator: boolean;
}

export function KnowledgeExplorer({ isCurator }: KnowledgeExplorerProps) {
  const [query, setQuery] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [evidenceLevel, setEvidenceLevel] = useState<EvidenceLevel | "">("");
  const [validityStatus, setValidityStatus] = useState<ValidityStatus | "">("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hits, setHits] = useState<EvidenceSearchHit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editValidity, setEditValidity] = useState<ValidityStatus>("active");
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  const activeFilterCount =
    (tagFilter.trim() ? 1 : 0) + (evidenceLevel ? 1 : 0) + (validityStatus ? 1 : 0);

  const runSearch = useCallback(
    async (overrides?: Partial<SearchCriteria>) => {
      setLoading(true);
      setError(null);
      const qValue = (overrides?.query !== undefined ? overrides.query : query).trim();
      const rawTags = overrides?.tagFilter !== undefined ? overrides.tagFilter : tagFilter;
      const nextEvidenceLevel =
        overrides?.evidenceLevel !== undefined ? overrides.evidenceLevel : evidenceLevel;
      const nextValidityStatus =
        overrides?.validityStatus !== undefined ? overrides.validityStatus : validityStatus;

      const parsedTags = rawTags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      try {
        const { data, error: apiError } = await apiClient.GET("/api/v1/knowledge/search", {
          params: {
            query: {
              q: qValue || undefined,
              tags: parsedTags.length > 0 ? parsedTags : undefined,
              evidence_level: nextEvidenceLevel || undefined,
              validity_status: nextValidityStatus || undefined,
              limit: 20,
            },
          },
        });
        if (data) {
          setHits(data.items);
        } else {
          setError(
            extractApiErrorDetail(apiError, "No se pudo consultar la Base de Conocimiento."),
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
    void runSearch({ query: "", tagFilter: "", evidenceLevel: "", validityStatus: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handleSlashShortcut(event: KeyboardEvent) {
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      event.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener("keydown", handleSlashShortcut);
    return () => window.removeEventListener("keydown", handleSlashShortcut);
  }, []);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void runSearch();
  };

  const handleQuickQuery = (term: string) => {
    setQuery(term);
    void runSearch({ query: term });
  };

  const handleResetFilters = () => {
    setQuery("");
    setTagFilter("");
    setEvidenceLevel("");
    setValidityStatus("");
    void runSearch({ query: "", tagFilter: "", evidenceLevel: "", validityStatus: "" });
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
      setError(extractApiErrorDetail(apiError, "No se pudo actualizar la Ficha de Evidencia."));
    }
  };

  return (
    <section className="space-y-5">
      <Surface variant="focal" padded="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label
                htmlFor="kb-search-input"
                className="block text-xs font-medium text-ink-muted"
              >
                Buscar Fichas de Evidencia (español, inglés o siglas como RIR, 1RM, HMB, ISSN,
                mTOR)
              </label>
              <span className="hidden text-xs text-ink-subtle sm:inline">Atajo: /</span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                ref={searchInputRef}
                id="kb-search-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ej.: volumen semanal hipertrofia, RIR, creatina, mTOR…"
                className="flex-1"
              />
              <Button type="submit">
                <Search className="h-4 w-4" aria-hidden="true" />
                <span>Buscar</span>
              </Button>
            </div>
            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-ink-subtle">Consultas rápidas:</span>
                {QUICK_QUERIES.map((term) => (
                  <Button
                    key={term}
                    variant="ghost"
                    size="sm"
                    onClick={() => handleQuickQuery(term)}
                    className="bg-surface-muted/70 text-ink-muted hover:text-ink"
                  >
                    {term}
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={filtersOpen || activeFilterCount > 0 ? "soft" : "secondary"}
                  size="sm"
                  aria-expanded={filtersOpen}
                  aria-controls="kb-advanced-filters"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : "Filtros"}
                  </span>
                </Button>

                {activeFilterCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={handleResetFilters}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Limpiar filtros</span>
                  </Button>
                )}
              </div>
            </div>
          </div>

          {filtersOpen && (
            <div
              id="kb-advanced-filters"
              className="grid grid-cols-1 gap-3 border-t border-line pt-3.5 sm:grid-cols-3"
            >
              <div>
                <label htmlFor="kb-tag-filter" className="mb-1 block text-xs text-ink-muted">
                  Etiquetas (separadas por coma)
                </label>
                <Input
                  compact
                  id="kb-tag-filter"
                  type="text"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                  placeholder="hipertrofia, volumen"
                />
              </div>

              <div>
                <label htmlFor="kb-level-filter" className="mb-1 block text-xs text-ink-muted">
                  Nivel de evidencia
                </label>
                <Select
                  compact
                  id="kb-level-filter"
                  value={evidenceLevel}
                  onChange={(e) => {
                    const nextLevel = e.target.value as EvidenceLevel | "";
                    setEvidenceLevel(nextLevel);
                    void runSearch({ evidenceLevel: nextLevel });
                  }}
                >
                  <option value="">Todos los niveles</option>
                  {(Object.keys(EVIDENCE_LEVEL_LABELS) as EvidenceLevel[]).map((lvl) => (
                    <option key={lvl} value={lvl}>
                      {EVIDENCE_LEVEL_LABELS[lvl]}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <label htmlFor="kb-validity-filter" className="mb-1 block text-xs text-ink-muted">
                  Vigencia
                </label>
                <Select
                  compact
                  id="kb-validity-filter"
                  value={validityStatus}
                  onChange={(e) => {
                    const nextValidity = e.target.value as ValidityStatus | "";
                    setValidityStatus(nextValidity);
                    void runSearch({ validityStatus: nextValidity });
                  }}
                >
                  <option value="">Cualquier vigencia</option>
                  {(Object.keys(VALIDITY_LABELS) as ValidityStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {VALIDITY_LABELS[st]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
        </form>
      </Surface>

      {error && <AlertBanner tone="error">{error}</AlertBanner>}
      {actionMessage && <AlertBanner tone="success">{actionMessage}</AlertBanner>}

      {loading ? (
        <p role="status" className="text-sm text-ink-muted">
          Buscando Fichas de Evidencia…
        </p>
      ) : hits.length === 0 ? (
        <Surface variant="inset" padded="lg" className="space-y-3 text-center">
          <p className="text-sm text-ink-muted">
            No se encontraron Fichas de Evidencia para los criterios seleccionados.
          </p>
          {activeFilterCount === 0 && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" size="sm" onClick={handleResetFilters}>
                Limpiar filtros
              </Button>
            </div>
          )}
        </Surface>
      ) : (
        <ul className="space-y-5">
          {hits.map((hit) => {
            const { card } = hit;
            return (
              <li
                key={card.id}
                className="space-y-3.5 rounded-panel border border-line bg-surface p-5 shadow-panel sm:p-6"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={VALIDITY_TONES[card.validity_status]}>
                    {VALIDITY_LABELS[card.validity_status]}
                  </Badge>
                  <Badge tone="secondary">
                    {EVIDENCE_LEVEL_LABELS[card.evidence_level] ?? card.evidence_level}
                  </Badge>
                  <Badge tone="neutral">
                    {card.coverage === "full_text" ? "Texto completo" : "Solo abstract"}
                  </Badge>
                </div>

                <h2 className="heading-section max-w-[46ch] text-xl text-ink">{card.title}</h2>
                <p className="max-w-[68ch] text-sm leading-relaxed text-ink-muted">
                  {card.curated_text_es}
                </p>

                {hit.updated_by_cards.length > 0 && (
                  <div className="max-w-[68ch] rounded-control border border-warning/35 bg-warning-soft/75 px-3.5 py-2 text-xs text-warning-text">
                    <span className="font-semibold">Actualizada por: </span>
                    {hit.updated_by_cards.map((u) => u.title).join(" · ")}
                  </div>
                )}

                {card.curator_notes && (
                  <p className="max-w-[68ch] text-xs leading-relaxed text-ink-muted">
                    <span className="font-semibold text-ink">Notas del Curador:</span>{" "}
                    {card.curator_notes}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {card.tags.map((tag) => (
                    <Badge key={tag} tone="accent">
                      #{tag}
                    </Badge>
                  ))}
                  {card.key_terms_en.map((term) => (
                    <Badge key={term} tone="neutral">
                      {term}
                    </Badge>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-xs">
                  <div className="flex flex-wrap items-center gap-3 text-ink-muted">
                    {card.doi && <span className="break-all font-mono text-xs">DOI: {card.doi}</span>}
                    {card.source_url && (
                      <a
                        href={card.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-accent-text hover:underline sm:min-h-[32px]"
                      >
                        <span>Abrir DOI / PubMed</span>
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>

                  {isCurator && editingCardId !== card.id && (
                    <Button variant="secondary" size="sm" onClick={() => handleStartEdit(hit)}>
                      Editar notas / vigencia
                    </Button>
                  )}
                </div>

                {isCurator && editingCardId === card.id && (
                  <div className="space-y-3 rounded-control border border-line bg-surface-muted/70 p-3.5">
                    <label className="block space-y-1 text-xs font-medium text-ink-muted">
                      <span>Notas del Curador</span>
                      <Textarea
                        compact
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        rows={2}
                      />
                    </label>
                    <label className="block space-y-1 text-xs font-medium text-ink-muted">
                      <span>Vigencia</span>
                      <Select
                        compact
                        value={editValidity}
                        onChange={(e) => setEditValidity(e.target.value as ValidityStatus)}
                      >
                        {(Object.keys(VALIDITY_LABELS) as ValidityStatus[]).map((st) => (
                          <option key={st} value={st}>
                            {VALIDITY_LABELS[st]}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => void handleSaveCard(card.id)}>
                        Guardar cambios
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => setEditingCardId(null)}>
                        Cancelar
                      </Button>
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
