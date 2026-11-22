import type { FormEvent, RefObject } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "../../ui/Button";
import { Input, Select } from "../../ui/Field";
import { HelpTip } from "../../ui/HelpTip";
import { Surface } from "../../ui/Surface";
import {
  EVIDENCE_LEVEL_LABELS,
  VALIDITY_LABELS,
  type EvidenceLevel,
  type ValidityStatus,
} from "./labels";

const QUICK_QUERIES = ["RIR", "creatina", "volumen", "hipertrofia"] as const;

interface KnowledgeFiltersPanelProps {
  searchInputRef: RefObject<HTMLInputElement>;
  query: string;
  tagFilter: string;
  evidenceLevel: EvidenceLevel | "";
  validityStatus: ValidityStatus | "";
  filtersOpen: boolean;
  activeFilterCount: number;
  onQueryChange: (value: string) => void;
  onTagFilterChange: (value: string) => void;
  onEvidenceLevelChange: (value: EvidenceLevel | "") => void;
  onValidityStatusChange: (value: ValidityStatus | "") => void;
  onToggleFilters: () => void;
  onQuickQuery: (term: string) => void;
  onResetFilters: () => void;
  onSubmit: (e: FormEvent) => void;
}

export function KnowledgeFiltersPanel({
  searchInputRef,
  query,
  tagFilter,
  evidenceLevel,
  validityStatus,
  filtersOpen,
  activeFilterCount,
  onQueryChange,
  onTagFilterChange,
  onEvidenceLevelChange,
  onValidityStatusChange,
  onToggleFilters,
  onQuickQuery,
  onResetFilters,
  onSubmit,
}: KnowledgeFiltersPanelProps) {
  return (
    <Surface variant="focal" padded="md">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <label
              htmlFor="kb-search-input"
              className="block text-xs font-medium text-ink-muted"
            >
              Buscar Fichas de Evidencia (español, inglés o siglas como RIR, 1RM, HMB, ISSN, mTOR)
            </label>
            <span className="hidden text-xs text-ink-subtle sm:inline">Atajo: /</span>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              ref={searchInputRef}
              id="kb-search-input"
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
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
                  onClick={() => onQuickQuery(term)}
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
                onClick={onToggleFilters}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  {activeFilterCount > 0 ? `Filtros (${activeFilterCount})` : "Filtros"}
                </span>
              </Button>

              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={onResetFilters}>
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Limpiar filtros</span>
                </Button>
              )}
            </div>
          </div>
          <div className="mt-2.5">
            <HelpTip
              term="rigor y actualización científica"
              triggerLabel="¿Cómo leer los niveles?"
              title="Niveles de evidencia y vigencia científica"
            >
              Los niveles ordenan el rigor metodológico (de metaanálisis y revisiones sistemáticas
              hasta ensayos controlados y guías de posicionamiento). La vigencia indica si una
              Ficha de Evidencia sigue vigente, matizada o superada por estudios posteriores
              aprobados por el Curador.
            </HelpTip>
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
                onChange={(e) => onTagFilterChange(e.target.value)}
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
                onChange={(e) => onEvidenceLevelChange(e.target.value as EvidenceLevel | "")}
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
                onChange={(e) => onValidityStatusChange(e.target.value as ValidityStatus | "")}
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
  );
}
