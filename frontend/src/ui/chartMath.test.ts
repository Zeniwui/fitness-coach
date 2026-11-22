import { describe, expect, it } from "vitest";
import {
  buildSvgAreaPath,
  buildSvgPolylinePoints,
  computeNiceDomain,
  formatCompactDateLabel,
  projectWeeklyTargetLine,
  scaleXIndex,
  scaleYValue,
  type ChartDimensions,
} from "./chartMath";

const DIMS: ChartDimensions = {
  width: 480,
  height: 200,
  padTop: 20,
  padRight: 20,
  padBottom: 30,
  padLeft: 50,
};

describe("chartMath pure SVG coordinate and scaling helpers", () => {
  it("handles empty series without NaN and returns a safe default domain", () => {
    const domain = computeNiceDomain([]);
    expect(domain.min).toBe(0);
    expect(domain.max).toBe(1);
    expect(domain.ticks).toEqual([0, 0.5, 1]);

    expect(buildSvgPolylinePoints([])).toBe("");
    expect(buildSvgAreaPath([], 170)).toBe("");
  });

  it("handles 1-point series and flat identical constant values without division-by-zero or NaN", () => {
    const singleDomain = computeNiceDomain([82]);
    expect(Number.isFinite(singleDomain.min)).toBe(true);
    expect(Number.isFinite(singleDomain.max)).toBe(true);
    expect(singleDomain.max).toBeGreaterThan(singleDomain.min);
    expect(singleDomain.min).toBeLessThan(82);
    expect(singleDomain.max).toBeGreaterThan(82);

    const flatDomain = computeNiceDomain([82, 82, 82]);
    expect(flatDomain.max).toBeGreaterThan(flatDomain.min);
    expect(flatDomain.ticks.length).toBeGreaterThanOrEqual(3);
    expect(flatDomain.ticks.every((t) => Number.isFinite(t))).toBe(true);

    const zeroFlatDomain = computeNiceDomain([0, 0], { includeZero: true });
    expect(zeroFlatDomain.min).toBe(0);
    expect(zeroFlatDomain.max).toBeGreaterThan(0);

    // Center single point horizontally and map flat y without NaN
    expect(scaleXIndex(0, 1, DIMS)).toBe(255); // padLeft (50) + plotWidth (410) / 2
    expect(Number.isFinite(scaleYValue(82, singleDomain, DIMS))).toBe(true);

    // Degenerate zero-span domain passed directly to scaleYValue stays finite
    expect(scaleYValue(82, { min: 82, max: 82 }, DIMS)).toBe(95); // padTop (20) + plotHeight (150) / 2
  });

  it("computes nice domains for positive, negative, and includeZero ranges", () => {
    const posDomain = computeNiceDomain([80.2, 81.5, 82.4]);
    expect(posDomain.min).toBeLessThanOrEqual(80.2);
    expect(posDomain.max).toBeGreaterThanOrEqual(82.4);
    expect(posDomain.ticks[0]).toBe(posDomain.min);
    expect(posDomain.ticks[posDomain.ticks.length - 1]).toBe(posDomain.max);

    const negSpanDomain = computeNiceDomain([-1.2, -0.4, 0.6]);
    expect(negSpanDomain.min).toBeLessThanOrEqual(-1.2);
    expect(negSpanDomain.max).toBeGreaterThanOrEqual(0.6);

    const zeroBased = computeNiceDomain([6, 10, 14], { includeZero: true });
    expect(zeroBased.min).toBe(0);
    expect(zeroBased.max).toBeGreaterThanOrEqual(14);
  });

  it("maps multi-point series linearly and builds valid SVG polyline and area paths", () => {
    const domain = { min: 0, max: 100 };
    const values = [0, 50, 100];
    const mapped = values.map((v, idx) => ({
      x: scaleXIndex(idx, values.length, DIMS),
      y: scaleYValue(v, domain, DIMS),
    }));

    expect(mapped[0]).toEqual({ x: 50, y: 170 }); // bottom-left
    expect(mapped[1]).toEqual({ x: 255, y: 95 }); // center
    expect(mapped[2]).toEqual({ x: 460, y: 20 }); // top-right

    expect(buildSvgPolylinePoints(mapped)).toBe("50,170 255,95 460,20");
    expect(buildSvgAreaPath(mapped, 170)).toBe("M 50 170 L 50 170 L 255 95 L 460 20 L 460 170 Z");
  });

  it("projects weekly target weight rate over chronological ISO dates including uneven gaps", () => {
    expect(projectWeeklyTargetLine([], 82, -0.5)).toEqual([]);
    expect(projectWeeklyTargetLine(["2026-11-01"], 82, -0.5)).toEqual([82]);

    // 7 days -> -0.5 kg, 14 days -> -1.0 kg, 21 days -> -1.5 kg
    expect(
      projectWeeklyTargetLine(["2026-11-01", "2026-11-08", "2026-11-15", "2026-11-22"], 82, -0.5),
    ).toEqual([82, 81.5, 81, 80.5]);

    // Positive bulk rate +0.25 kg/week over 14 days -> +0.5 kg
    expect(projectWeeklyTargetLine(["2026-11-01", "2026-11-15"], 75, 0.25)).toEqual([75, 75.5]);

    // Maintenance 0 kg/week stays constant
    expect(projectWeeklyTargetLine(["2026-11-01", "2026-11-08"], 78.4, 0)).toEqual([78.4, 78.4]);
  });

  it("formats compact Spanish date labels safely", () => {
    expect(formatCompactDateLabel("2026-11-18")).toBe("18 nov");
    expect(formatCompactDateLabel("2026-01-05")).toBe("5 ene");
    expect(formatCompactDateLabel("invalid-date")).toBe("invalid-date");
  });
});
