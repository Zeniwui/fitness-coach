import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Deterministic guardrail for unambiguous user-facing `_Avoid_` terms from GLOSSARY.md.
 * Prevents domain-language drift in Spanish UI components (e.g. "Entreno" instead of "Entrenamiento").
 */
const FORBIDDEN_UI_TERMS: Array<{ pattern: RegExp; preferred: string }> = [
  { pattern: /\bEntreno\b/, preferred: "Entrenamiento / Sesión de Entrenamiento" },
  { pattern: /\bchatbot\b/i, preferred: "Coach" },
  { pattern: /\bdieta\b/i, preferred: "Fase Nutricional" },
  { pattern: /\bbolet[ií]n\b/i, preferred: "Corte Mensual" },
];

function collectUiFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectUiFiles(full));
    } else if (full.endsWith(".tsx") && !full.endsWith(".test.tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("GLOSSARY.md user-facing UI terminology guard", () => {
  it("avoids forbidden domain terms in app and feature TSX components", () => {
    const srcRoot = join(process.cwd(), "src");
    const files = [
      ...collectUiFiles(join(srcRoot, "app")),
      ...collectUiFiles(join(srcRoot, "features")),
    ];

    const violations: string[] = [];
    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const rel = relative(srcRoot, file);
      for (const { pattern, preferred } of FORBIDDEN_UI_TERMS) {
        if (pattern.test(content)) {
          violations.push(`${rel}: matched ${pattern} (use ${preferred})`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
