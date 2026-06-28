import { describe, it, expect } from "vitest";
import { interiorAngle, reflexAngle, bisectorPoint, arcPath } from "./geometry";

const P = (x, y) => ({ x, y });

describe("interiorAngle", () => {
  it("is 90 for a right angle", () => {
    expect(interiorAngle(P(0, -1), P(0, 0), P(1, 0))).toBeCloseTo(90);
  });

  it("is 180 for a straight line", () => {
    expect(interiorAngle(P(-1, 0), P(0, 0), P(1, 0))).toBeCloseTo(180);
  });

  it("is 45 for a 45-degree bend", () => {
    expect(interiorAngle(P(1, -1), P(0, 0), P(1, 0))).toBeCloseTo(45);
  });

  it("always returns the smaller (<=180) angle", () => {
    const a = interiorAngle(P(-1, -1), P(0, 0), P(1, -1));
    expect(a).toBeCloseTo(90);
    expect(a).toBeLessThanOrEqual(180);
  });

  it("returns 0 when a neighbor coincides with the vertex", () => {
    expect(interiorAngle(P(0, 0), P(0, 0), P(1, 0))).toBe(0);
  });
});

describe("reflexAngle", () => {
  it("complements the interior angle to 360", () => {
    expect(reflexAngle(P(0, -1), P(0, 0), P(1, 0))).toBeCloseTo(270);
  });
});

describe("bisectorPoint", () => {
  it("lies on the interior bisector at the given radius", () => {
    const b = bisectorPoint(P(0, -1), P(0, 0), P(1, 0), Math.SQRT2);
    expect(b.x).toBeCloseTo(1);
    expect(b.y).toBeCloseTo(-1);
  });

  it("points to the opposite side for the reflex angle", () => {
    const b = bisectorPoint(P(0, -1), P(0, 0), P(1, 0), Math.SQRT2, {
      reflex: true,
    });
    expect(b.x).toBeCloseTo(-1);
    expect(b.y).toBeCloseTo(1);
  });
});

describe("arcPath", () => {
  it("draws an SVG arc at the requested radius from one ray to the other", () => {
    const d = arcPath(P(0, -1), P(0, 0), P(1, 0), 1);
    // starts at the point on the ray toward prev: (0,-1)
    expect(d).toMatch(/^M 0 -1/);
    expect(d).toContain("A 1 1");
    // ends at the point on the ray toward next: (1,0)
    expect(d.trim()).toMatch(/1 0$/);
  });

  it("uses the large-arc flag for the reflex sweep", () => {
    const minor = arcPath(P(0, -1), P(0, 0), P(1, 0), 1);
    const major = arcPath(P(0, -1), P(0, 0), P(1, 0), 1, { reflex: true });
    expect(minor).toContain("A 1 1 0 0 ");
    expect(major).toContain("A 1 1 0 1 ");
  });
});
