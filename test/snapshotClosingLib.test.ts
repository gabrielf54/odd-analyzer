import { describe, it, expect } from "vitest";
import { matchClosingOdd } from "../src/cli/snapshotClosingLib.js";

describe("matchClosingOdd", () => {
  const payload = {
    odds: [
      { market_type: "gols", linha: 2.5, odd_over: 1.95, odd_under: 1.90, book: "bet365" },
      { market_type: "gols", linha: 1.5, odd_over: 1.40, book: "bet365" },
      { market_type: "escanteios", linha: 9.5, odd_over: 2.05, book: "betano" },
    ],
  };

  it("acha a odd over do mercado+linha", () => {
    expect(matchClosingOdd(payload, "gols", 2.5)).toBe(1.95);
    expect(matchClosingOdd(payload, "escanteios", 9.5)).toBe(2.05);
  });

  it("filtra por book quando passado", () => {
    expect(matchClosingOdd(payload, "escanteios", 9.5, "bet365")).toBeNull();
    expect(matchClosingOdd(payload, "escanteios", 9.5, "betano")).toBe(2.05);
  });

  it("retorna null quando não acha (linha ausente)", () => {
    expect(matchClosingOdd(payload, "gols", 3.5)).toBeNull();
  });

  it("tolera array cru e odd inválida", () => {
    expect(matchClosingOdd([{ market: "gols", line: 2.5, over: 1.8 }], "gols", 2.5)).toBe(1.8);
    expect(matchClosingOdd({ odds: [{ market_type: "gols", linha: 2.5, odd_over: 0.5 }] }, "gols", 2.5)).toBeNull();
  });
});
