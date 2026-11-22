import { useRef, type KeyboardEvent } from "react";

export interface SegmentedTabItem<T extends string> {
  id: T;
  label: string;
  count?: number;
  indicator?: string;
}

interface SegmentedTabsProps<T extends string> {
  items: ReadonlyArray<SegmentedTabItem<T>>;
  activeId: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  idPrefix: string;
  layout?: "grid" | "wrap";
}

export function SegmentedTabs<T extends string>({
  items,
  activeId,
  onChange,
  ariaLabel,
  idPrefix,
  layout = "wrap",
}: SegmentedTabsProps<T>) {
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLButtonElement>) {
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") {
      nextIndex = (index + 1) % items.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (index - 1 + items.length) % items.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = items.length - 1;
    }

    if (nextIndex !== null) {
      event.preventDefault();
      const target = items[nextIndex];
      if (target) {
        onChange(target.id);
        buttonRefs.current[nextIndex]?.focus();
      }
    }
  }

  const containerClass =
    layout === "grid"
      ? "grid grid-cols-2 gap-1.5 rounded-panel border border-line bg-surface-muted/70 p-1 sm:grid-cols-4"
      : "flex flex-wrap gap-1.5 rounded-panel border border-line bg-surface-muted/70 p-1";

  return (
    <div role="tablist" aria-label={ariaLabel} className={containerClass}>
      {items.map((item, idx) => {
        const isSelected = activeId === item.id;
        return (
          <button
            key={item.id}
            ref={(el) => {
              buttonRefs.current[idx] = el;
            }}
            id={`${idPrefix}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onChange(item.id)}
            onKeyDown={(e) => handleKeyDown(idx, e)}
            className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-control px-3.5 py-2 text-xs font-semibold transition-colors sm:min-h-[38px] ${
              isSelected
                ? "bg-surface text-ink shadow-sm"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <span>{item.label}</span>
            {item.indicator && (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent-text">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
                <span>{item.indicator}</span>
              </span>
            )}
            {item.count !== undefined && (
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs tabular-nums ${
                  isSelected
                    ? "bg-accent-soft text-accent-text"
                    : "bg-surface/70 text-ink-muted"
                }`}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
