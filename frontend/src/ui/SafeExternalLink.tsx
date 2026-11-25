import type { ReactNode } from "react";
import { getSafeHttpUrl } from "./safeUrl";

interface SafeExternalLinkProps {
  url: string | null | undefined;
  children: ReactNode;
  className?: string;
  fallbackClassName?: string;
  fallbackText?: string;
}

/**
 * Renders an external `<a>` link only when `url` has an `http:` or `https:` scheme;
 * otherwise renders a plain `<span>` fallback so unsafe schemes are never clickable.
 */
export function SafeExternalLink({
  url,
  children,
  className,
  fallbackClassName = "break-all font-mono text-xs text-ink-muted",
  fallbackText,
}: SafeExternalLinkProps) {
  const safeUrl = getSafeHttpUrl(url);
  if (!safeUrl) {
    return <span className={fallbackClassName}>{fallbackText ?? url}</span>;
  }
  return (
    <a href={safeUrl} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}
