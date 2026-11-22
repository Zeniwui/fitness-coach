export interface ChartDimensions {
  width: number;
  height: number;
  padTop: number;
  padRight: number;
  padBottom: number;
  padLeft: number;
}

export interface ChartDomain {
  min: number;
  max: number;
  ticks: number[];
}

export interface NumericPoint {
  id: string;
  label: string;
  value: number;
  secondaryLabel?: string;
}

export interface MappedPoint extends NumericPoint {
  x: number;
  y: number;
}

export interface NiceDomainOptions {
  includeZero?: boolean;
  tickCount?: number;
  padFraction?: number;
  minSpan?: number;
}

const SPANISH_MONTHS = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
] as const;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

function roundCoord(value: number): number {
  return Math.round(value * 100) / 100;
}

function cleanTick(value: number): number {
  const rounded = Math.round(value * 10_000) / 10_000;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function niceStep(rawStep: number): number {
  if (!Number.isFinite(rawStep) || rawStep <= 0) return 1;
  const exponent = Math.floor(Math.log10(rawStep));
  const magnitude = 10 ** exponent;
  const fraction = rawStep / magnitude;

  let niceFraction: number;
  if (fraction <= 1) {
    niceFraction = 1;
  } else if (fraction <= 2) {
    niceFraction = 2;
  } else if (fraction <= 2.5) {
    niceFraction = 2.5;
  } else if (fraction <= 5) {
    niceFraction = 5;
  } else {
    niceFraction = 10;
  }
  return cleanTick(niceFraction * magnitude);
}

/**
 * Computes a clean, finite numeric domain and ascending ticks for SVG charts.
 * Safely handles empty arrays, single-point series, constant/flat series, and negative spans.
 */
export function computeNiceDomain(
  values: number[],
  options: NiceDomainOptions = {},
): ChartDomain {
  const finiteValues = values.filter((v) => Number.isFinite(v));
  if (finiteValues.length === 0) {
    return { min: 0, max: 1, ticks: [0, 0.5, 1] };
  }

  const includeZero = options.includeZero ?? false;
  const tickCount = Math.max(2, Math.round(options.tickCount ?? 4));
  const padFraction = options.padFraction ?? 0.08;
  const minSpan = options.minSpan ?? 1;

  let rawMin = Math.min(...finiteValues);
  let rawMax = Math.max(...finiteValues);

  if (includeZero) {
    rawMin = Math.min(0, rawMin);
    rawMax = Math.max(0, rawMax);
  }

  let span = rawMax - rawMin;
  if (span === 0) {
    if (includeZero && rawMax > 0) {
      rawMin = 0;
      rawMax = rawMax * 1.2;
    } else if (includeZero && rawMax === 0) {
      rawMin = 0;
      rawMax = Math.max(minSpan, 2);
    } else {
      const half = Math.max(minSpan / 2, Math.abs(rawMax) * 0.05);
      rawMin -= half;
      rawMax += half;
    }
    span = rawMax - rawMin;
  } else {
    const pad = span * padFraction;
    rawMin = includeZero && rawMin >= 0 ? 0 : rawMin - pad;
    rawMax = rawMax + pad;
    span = rawMax - rawMin;
  }

  const step = niceStep(span / (tickCount - 1));
  const niceMin = cleanTick(Math.floor(rawMin / step) * step);
  let niceMax = cleanTick(Math.ceil(rawMax / step) * step);

  if (niceMax <= niceMin) {
    niceMax = cleanTick(niceMin + step);
  }

  const ticks: number[] = [];
  const totalSteps = Math.max(1, Math.round((niceMax - niceMin) / step));
  for (let i = 0; i <= totalSteps; i += 1) {
    ticks.push(cleanTick(niceMin + i * step));
  }

  return {
    min: ticks[0],
    max: ticks[ticks.length - 1],
    ticks,
  };
}

export function scaleXIndex(index: number, count: number, dims: ChartDimensions): number {
  const plotWidth = Math.max(0, dims.width - dims.padLeft - dims.padRight);
  if (count <= 1) {
    return roundCoord(dims.padLeft + plotWidth / 2);
  }
  const clamped = Math.max(0, Math.min(count - 1, index));
  return roundCoord(dims.padLeft + (clamped / (count - 1)) * plotWidth);
}

export function scaleYValue(
  value: number,
  domain: Pick<ChartDomain, "min" | "max">,
  dims: ChartDimensions,
): number {
  const plotHeight = Math.max(0, dims.height - dims.padTop - dims.padBottom);
  const span = domain.max - domain.min;
  if (!Number.isFinite(value) || !Number.isFinite(span) || span === 0) {
    return roundCoord(dims.padTop + plotHeight / 2);
  }
  const ratio = (value - domain.min) / span;
  return roundCoord(dims.padTop + (1 - ratio) * plotHeight);
}

export function mapSeriesToPoints(
  points: NumericPoint[],
  domain: Pick<ChartDomain, "min" | "max">,
  dims: ChartDimensions,
): MappedPoint[] {
  return points.map((pt, idx) => ({
    ...pt,
    x: scaleXIndex(idx, points.length, dims),
    y: scaleYValue(pt.value, domain, dims),
  }));
}

export function buildSvgPolylinePoints(points: ReadonlyArray<{ x: number; y: number }>): string {
  if (points.length === 0) return "";
  return points.map((p) => `${roundCoord(p.x)},${roundCoord(p.y)}`).join(" ");
}

export function buildSvgAreaPath(
  points: ReadonlyArray<{ x: number; y: number }>,
  baselineY: number,
): string {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  const base = roundCoord(baselineY);
  const lineSegments = points.map((p) => `L ${roundCoord(p.x)} ${roundCoord(p.y)}`).join(" ");
  return `M ${roundCoord(first.x)} ${base} ${lineSegments} L ${roundCoord(last.x)} ${base} Z`;
}

function parseIsoDateUtc(isoDate: string): number | null {
  const match = ISO_DATE_RE.exec(isoDate.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return Date.UTC(year, month - 1, day);
}

/**
 * Projects a target weekly weight rate (kg/week) starting from `startValue` on `datesIso[0]`
 * across chronologically ordered ISO dates (`YYYY-MM-DD`).
 */
export function projectWeeklyTargetLine(
  datesIso: string[],
  startValue: number,
  weeklyRateKg: number,
): number[] {
  if (datesIso.length === 0 || !Number.isFinite(startValue) || !Number.isFinite(weeklyRateKg)) {
    return [];
  }
  const startTs = parseIsoDateUtc(datesIso[0]);
  return datesIso.map((iso, idx) => {
    if (idx === 0) return roundCoord(startValue);
    const currentTs = parseIsoDateUtc(iso);
    const weeksElapsed =
      startTs !== null && currentTs !== null ? (currentTs - startTs) / (7 * MS_PER_DAY) : idx;
    return roundCoord(startValue + weeksElapsed * weeklyRateKg);
  });
}

/**
 * Formats an ISO date (`YYYY-MM-DD`) into a compact locale-independent Spanish axis label (e.g. `18 nov`).
 */
export function formatCompactDateLabel(isoDate: string): string {
  const match = ISO_DATE_RE.exec(isoDate.trim());
  if (!match) return isoDate;
  const monthIdx = Number(match[2]) - 1;
  const day = Number(match[3]);
  const month = SPANISH_MONTHS[monthIdx];
  if (!month || !Number.isFinite(day)) return isoDate;
  return `${day} ${month}`;
}
