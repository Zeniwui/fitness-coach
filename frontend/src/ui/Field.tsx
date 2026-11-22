import type {
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

export const FIELD_BASE_CLASS =
  "w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:border-accent focus:outline-none disabled:opacity-60";

export const FIELD_COMPACT_CLASS =
  "w-full rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-subtle transition-colors focus:border-accent focus:outline-none disabled:opacity-60";

export function Input({
  className = "",
  compact = false,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }) {
  return (
    <input
      className={`${compact ? FIELD_COMPACT_CLASS : FIELD_BASE_CLASS} ${className}`}
      {...rest}
    />
  );
}

export function Select({
  className = "",
  compact = false,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }) {
  return (
    <select
      className={`${compact ? FIELD_COMPACT_CLASS : FIELD_BASE_CLASS} ${className}`}
      {...rest}
    />
  );
}

export function Textarea({
  className = "",
  compact = false,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { compact?: boolean }) {
  return (
    <textarea
      className={`${compact ? FIELD_COMPACT_CLASS : FIELD_BASE_CLASS} ${className}`}
      {...rest}
    />
  );
}
