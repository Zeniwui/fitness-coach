/**
 * Calibrated barbell emblem for Fitness Coach (Cuaderno de Hierro).
 */
export function ClassicalMark({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M5 20H35"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <rect
        x="10"
        y="11"
        width="4.5"
        height="18"
        rx="1.25"
        fill="currentColor"
      />
      <rect
        x="25.5"
        y="11"
        width="4.5"
        height="18"
        rx="1.25"
        fill="currentColor"
      />
      <rect
        x="5.5"
        y="14.5"
        width="3"
        height="11"
        rx="1"
        fill="currentColor"
        opacity="0.72"
      />
      <rect
        x="31.5"
        y="14.5"
        width="3"
        height="11"
        rx="1"
        fill="currentColor"
        opacity="0.72"
      />
    </svg>
  );
}
