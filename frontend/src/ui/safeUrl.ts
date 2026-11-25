/**
 * Validate external URLs for safe rendering in `<a href>` elements.
 * Only `http:` and `https:` schemes are permitted; `javascript:`, `data:`, etc. return `null`.
 */
export function getSafeHttpUrl(raw: string | null | undefined): string | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}
