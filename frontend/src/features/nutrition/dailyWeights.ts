export interface ParsedDailyWeights {
  weights: number[];
  average: number | null;
  ignoredTokens: string[];
}

const SINGLE_NUMBER_RE = /^\d+(?:[.,]\d+)?$/;
const DOT_NUMBER_RE = /^\d+(?:\.\d+)?$/;
const MIXED_OR_SPANISH_NO_SPACE_RE =
  /^(?:\d+\.\d+|\d{2,3},\d{1,2})(?:,(?:\d+\.\d+|\d{2,3},\d{1,2}))+$/;
const MIXED_OR_SPANISH_TOKEN_RE = /\d+\.\d+|\d{2,3},\d{1,2}/g;
const INT_WEIGHT_RE = /^\d{2,3}$/;

function parseNormalizedNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function isValidBodyWeight(value: number): boolean {
  return Number.isFinite(value) && value >= 20 && value <= 350;
}

function expandChunk(chunk: string): { numbers: string[]; invalid: string[] } {
  const cleaned = chunk.trim().replace(/^,+|,+$/g, "");
  if (!cleaned) return { numbers: [], invalid: [] };

  if (SINGLE_NUMBER_RE.test(cleaned)) {
    return { numbers: [cleaned], invalid: [] };
  }

  // Handle comma-separated numbers without spaces (e.g. "82.2,82.0,81.8")
  if (cleaned.includes(".") && cleaned.includes(",")) {
    const commaParts = cleaned.split(",").filter(Boolean);
    if (commaParts.every((part) => DOT_NUMBER_RE.test(part))) {
      return { numbers: commaParts, invalid: [] };
    }
  }

  // Handle Spanish decimal commas without spaces (e.g. "82,1,81,9" or "82,1,82.0")
  if (MIXED_OR_SPANISH_NO_SPACE_RE.test(cleaned)) {
    const matches = cleaned.match(MIXED_OR_SPANISH_TOKEN_RE) ?? [];
    return { numbers: matches, invalid: [] };
  }

  // Handle comma-separated integer weights without spaces (e.g. "82,81,80")
  if (cleaned.includes(",") && !cleaned.includes(".")) {
    const commaParts = cleaned.split(",").filter(Boolean);
    if (
      commaParts.length >= 3 &&
      commaParts.every((part) => INT_WEIGHT_RE.test(part) && isValidBodyWeight(Number(part)))
    ) {
      return { numbers: commaParts, invalid: [] };
    }
  }

  return { numbers: [], invalid: [cleaned] };
}

export function parseDailyWeightsDetailed(raw: string): ParsedDailyWeights {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { weights: [], average: null, ignoredTokens: [] };
  }

  // Split first on unambiguous delimiters: semicolons, newlines, comma+space, or whitespace
  const chunks = trimmed.split(/[;\n\r\t]+|,\s+|\s+/);
  const weights: number[] = [];
  const ignoredTokens: string[] = [];

  for (const chunk of chunks) {
    const { numbers, invalid } = expandChunk(chunk);
    for (const token of invalid) {
      ignoredTokens.push(token);
    }
    for (const token of numbers) {
      const value = parseNormalizedNumber(token);
      if (isValidBodyWeight(value)) {
        weights.push(value);
      } else {
        ignoredTokens.push(token);
      }
    }
  }

  const average =
    weights.length > 0
      ? Number((weights.reduce((acc, w) => acc + w, 0) / weights.length).toFixed(2))
      : null;

  return { weights, average, ignoredTokens };
}

export function parseDailyWeights(raw: string): number[] {
  return parseDailyWeightsDetailed(raw).weights;
}
