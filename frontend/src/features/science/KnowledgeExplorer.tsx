import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ExternalLink, Search } from "lucide-react";
import { apiClient } from "../../api/client";
import type { components } from "../../api/generated/schema";
import { AlertBanner } from "../../ui/AlertBanner";
import { Badge, type BadgeTone } from "../../ui/Badge";
import { Button } from "../../ui/Button";
import { Input, Select, Textarea } from "../../ui/Field";
import { Surface } from "../../ui/Surface";

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

const VALIDITY_TONES: Record<ValidityStatus, BadgeTone> = {
  active: "success",
  nuanced: "warning",
  superseded: "danger",
  archived: "neutral",
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
    <section className="space-y-5">
      <Surface variant="classical" padded="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="kb-search-input"
              className="mb-1.5 block text-xs font-medium text-ink-muted"
            >
              Buscar Fichas de Evidencia (español, inglés o siglas como RIR, 1RM, HMB, ISSN, mTOR)
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
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
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                onChange={(e) => setEvidenceLevel(e.target.value as EvidenceLevel | "")}
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
                onChange={(e) => setValidityStatus(e.target.value as ValidityStatus | "")}
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
        </form>
      </Surface>

      {error && <AlertBanner tone="error">{error}</AlertBanner>}
      {actionMessage && <AlertBanner tone="success">{actionMessage}</AlertBanner>}

      {loading ? (
        <p className="text-sm text-ink-muted">Buscando Fichas de Evidencia…</p>
      ) : hits.length === 0 ? (
        <Surface variant="inset" padded="lg" className="text-center text-sm text-ink-muted">
          No se encontraron Fichas de Evidencia para los criterios seleccionados.
        </Surface>
      ) : (
        <ul className="space-y-4">
          {hits.map((hit) => {
            const { card } = hit;
            return (
              <li
                key={card.id}
                className="space-y-3 rounded-panel border border-line bg-surface p-5 shadow-panel"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={VALIDITY_TONES[card.validity_status]}>
                    {VALIDITY_LABELS[card.validity_status]}
                  </Badge>
                  <Badge tone="secondary">{EVIDENCE_LEVEL_LABELS[card.evidence_level]}</Badge>
                  <Badge tone="neutral">
                    {card.coverage === "full_text" ? "Texto completo" : "Solo abstract"}
                  </Badge>
                </div>

                <h2 className="heading-section text-xl text-ink">{card.title}</h2>
                <p className="max-w-[76ch] text-sm leading-relaxed text-ink-muted">
                  {card.curated_text_es}
                </p>

                {hit.updated_by_cards.length > 0 && (
                  <div className="rounded-control border border-warning/35 bg-warning-soft/75 px-3.5 py-2 text-xs text-warning-text">
                    <span className="font-semibold">Actualizada por: </span>
                    {hit.updated_by_cards.map((u) => u.title).join(" · ")}
                  </div>
                )}

                {card.curator_notes && (
                  <p className="text-xs leading-relaxed text-ink-muted">
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
                    {card.doi && <span className="font-mono text-[11px]">DOI: {card.doi}</span>}
                    {card.source_url && (
                      <a
                        href={card.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 font-semibold text-accent-text hover:underline"
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
