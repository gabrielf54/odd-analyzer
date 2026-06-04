import { describe, it, expect } from "vitest";
import { shrinkRate } from "../src/model/shrinkage.js";

describe("shrinkRate", () => {
  it("apps=0 retorna o prior", () => {
    expect(shrinkRate(5.0, 0, 0.4, 12.0)).toBeCloseTo(0.4, 12);
  });
  it("média ponderada entre taxa e prior", () => {
    // (10*1.0 + 12*0.4)/(10+12) = 14.8/22
    expect(shrinkRate(1.0, 10, 0.4, 12.0)).toBeCloseTo(14.8 / 22, 12);
  });
});
