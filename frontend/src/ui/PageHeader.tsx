import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description: string;
  action?: ReactNode;
  meta?: ReactNode;
}

export function PageHeader({ title, description, action, meta }: PageHeaderProps) {
  return (
    <header className="classical-entablature pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="max-w-2xl space-y-1.5">
          {meta && <div className="flex flex-wrap items-center gap-2">{meta}</div>}
          <h1 className="heading-display text-ink">{title}</h1>
          <p className="text-sm leading-relaxed text-ink-muted">{description}</p>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </header>
  );
}
