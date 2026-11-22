import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { apiClient, extractApiErrorDetail } from "../../api/client";
import { AlertBanner } from "../../ui/AlertBanner";
import { Button } from "../../ui/Button";
import { Surface } from "../../ui/Surface";
import { EvidenceCardItem, type EvidenceSearchHit } from "./EvidenceCardItem";
import { KnowledgeFiltersPanel } from "./KnowledgeFiltersPanel";
import type { EvidenceLevel, ValidityStatus } from "./labels";

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
      <KnowledgeFiltersPanel
        searchInputRef={searchInputRef}
        query={query}
        tagFilter={tagFilter}
        evidenceLevel={evidenceLevel}
        validityStatus={validityStatus}
        filtersOpen={filtersOpen}
        activeFilterCount={activeFilterCount}
        onQueryChange={setQuery}
        onTagFilterChange={setTagFilter}
        onEvidenceLevelChange={(nextLevel) => {
          setEvidenceLevel(nextLevel);
          void runSearch({ evidenceLevel: nextLevel });
        }}
        onValidityStatusChange={(nextValidity) => {
          setValidityStatus(nextValidity);
          void runSearch({ validityStatus: nextValidity });
        }}
        onToggleFilters={() => setFiltersOpen((prev) => !prev)}
        onQuickQuery={handleQuickQuery}
        onResetFilters={handleResetFilters}
        onSubmit={handleSubmit}
      />

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
          {hits.map((hit) => (
            <EvidenceCardItem
              key={hit.card.id}
              hit={hit}
              isCurator={isCurator}
              isEditing={editingCardId === hit.card.id}
              editNotes={editNotes}
              editValidity={editValidity}
              onStartEdit={handleStartEdit}
              onEditNotesChange={setEditNotes}
              onEditValidityChange={setEditValidity}
              onSaveEdit={(cardId) => void handleSaveCard(cardId)}
              onCancelEdit={() => setEditingCardId(null)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
