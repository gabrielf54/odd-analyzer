import { describe, it, expect } from "vitest";
import { edgeEv } from "../src/value/ev.js";

describe("edgeEv", () => {
  it("edge = modelo - devig; ev = modelo*odd - 1", () => {
    const m = edgeEv(0.6, 0.5, 1.9);
    expect(m.edge).toBeCloseTo(0.1, 12);
    expect(m.ev).toBeCloseTo(0.6 * 1.9 - 1.0, 12);
  });
});
