/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--c-surface) / <alpha-value>)",
          muted: "rgb(var(--c-surface-muted) / <alpha-value>)",
          elevated: "rgb(var(--c-surface-elevated) / <alpha-value>)",
        },
        rail: {
          DEFAULT: "rgb(var(--c-rail) / <alpha-value>)",
          surface: "rgb(var(--c-rail-surface) / <alpha-value>)",
          ink: "rgb(var(--c-rail-ink) / <alpha-value>)",
          muted: "rgb(var(--c-rail-ink-muted) / <alpha-value>)",
          border: "rgb(var(--c-rail-border) / <alpha-value>)",
          active: "rgb(var(--c-rail-active-bg) / <alpha-value>)",
          "active-ink": "rgb(var(--c-rail-active-ink) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          muted: "rgb(var(--c-ink-muted) / <alpha-value>)",
          subtle: "rgb(var(--c-ink-subtle) / <alpha-value>)",
        },
        line: {
          DEFAULT: "rgb(var(--c-line) / <alpha-value>)",
          strong: "rgb(var(--c-line-strong) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--c-accent) / <alpha-value>)",
          hover: "rgb(var(--c-accent-hover) / <alpha-value>)",
          soft: "rgb(var(--c-accent-soft) / <alpha-value>)",
          ink: "rgb(var(--c-accent-ink) / <alpha-value>)",
          text: "rgb(var(--c-accent-text) / <alpha-value>)",
        },
        secondary: {
          DEFAULT: "rgb(var(--c-secondary) / <alpha-value>)",
          soft: "rgb(var(--c-secondary-soft) / <alpha-value>)",
          text: "rgb(var(--c-secondary-text) / <alpha-value>)",
        },
        success: {
          DEFAULT: "rgb(var(--c-success) / <alpha-value>)",
          soft: "rgb(var(--c-success-soft) / <alpha-value>)",
          text: "rgb(var(--c-success-text) / <alpha-value>)",
        },
        warning: {
          DEFAULT: "rgb(var(--c-warning) / <alpha-value>)",
          soft: "rgb(var(--c-warning-soft) / <alpha-value>)",
          text: "rgb(var(--c-warning-text) / <alpha-value>)",
        },
        danger: {
          DEFAULT: "rgb(var(--c-danger) / <alpha-value>)",
          soft: "rgb(var(--c-danger-soft) / <alpha-value>)",
          text: "rgb(var(--c-danger-text) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["var(--font-display)"],
        sans: ["var(--font-sans)"],
      },
      borderRadius: {
        panel: "var(--radius-panel)",
        control: "var(--radius-control)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        elevated: "var(--shadow-elevated)",
      },
    },
  },
  plugins: [],
};
