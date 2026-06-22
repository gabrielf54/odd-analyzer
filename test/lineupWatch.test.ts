import { describe, it, expect } from "vitest";
import { detectFlip } from "../src/scheduler/lineupWatch.js";

describe("detectFlip (salto da escalação)", () => {
  it("predicted → confirmed = salto", () => expect(detectFlip("predicted", "confirmed")).toBe(true));
  it("unknown → confirmed = salto", () => expect(detectFlip("unknown", "confirmed")).toBe(true));
  it("null prev → confirmed = salto", () => expect(detectFlip(null, "confirmed")).toBe(true));
  it("confirmed → confirmed = não (já capturado)", () => expect(detectFlip("confirmed", "confirmed")).toBe(false));
  it("predicted → predicted = não", () => expect(detectFlip("predicted", "predicted")).toBe(false));
  it("predicted → unknown = não", () => expect(detectFlip("predicted", "unknown")).toBe(false));
});
