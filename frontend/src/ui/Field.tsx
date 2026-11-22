import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";

export const FIELD_BASE_CLASS =
  "min-h-[44px] sm:min-h-[40px] w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-subtle transition-colors focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent focus-visible:ring-2 focus-visible:ring-accent/25 aria-[invalid=true]:border-danger disabled:opacity-60";

export const FIELD_COMPACT_CLASS =
  "min-h-[44px] sm:min-h-[34px] w-full rounded-control border border-line-strong bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-subtle transition-colors focus:border-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent focus-visible:ring-2 focus-visible:ring-accent/25 aria-[invalid=true]:border-danger disabled:opacity-60";

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement> & { compact?: boolean }
>(function Input({ className = "", compact = false, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`${compact ? FIELD_COMPACT_CLASS : FIELD_BASE_CLASS} ${className}`}
      {...rest}
    />
  );
});

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & { compact?: boolean }
>(function Select({ className = "", compact = false, ...rest }, ref) {
  return (
    <select
      ref={ref}
      className={`${compact ? FIELD_COMPACT_CLASS : FIELD_BASE_CLASS} ${className}`}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement> & { compact?: boolean }
>(function Textarea({ className = "", compact = false, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={`${compact ? FIELD_COMPACT_CLASS : FIELD_BASE_CLASS} ${className}`}
      {...rest}
    />
  );
});
