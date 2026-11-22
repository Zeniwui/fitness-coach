/**
 * Refined geometric mark blending an Ancient Greek pediment & barbell proportion.
 * Used as the single sculptural brand signature without cluttering functional screens.
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
        d="M8 14L20 7.5L32 14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.82"
      />
      <path
        d="M6.5 21.5H33.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12.5 16.5V26.5M27.5 16.5V26.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M8.5 18.5V24.5M31.5 18.5V24.5"
        stroke="currentColor"
        strokeWidth="1.65"
        strokeLinecap="round"
        opacity="0.78"
      />
      <path
        d="M11 31.5H29"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}

/**
 * Ultra-subtle architectural meander hairline — visible strictly in Ateneo mode
 * via `.classical-meander-strip` CSS rules.
 */
export function ClassicalMeanderStrip({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`classical-meander-strip overflow-hidden ${className}`}>
      <svg className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <pattern id="fc-meander" width="24" height="10" patternUnits="userSpaceOnUse">
            <path
              d="M0 8H8V2H18V6H12V4H14M18 8H24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.15"
              strokeLinecap="square"
            />
          </pattern>
        </defs>
        <rect width="100%" height="10" fill="url(#fc-meander)" />
      </svg>
    </div>
  );
}
