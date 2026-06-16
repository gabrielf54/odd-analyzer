import { describe, it, expect } from "vitest";
import { matchClosingOdd } from "../src/cli/snapshotClosingLib.js";

// Formato REAL da BSD (plano) — ver spike 2026-06-15.
const payload = {
  event_id: 8302,
  odds: {
    home_win: 1.91, draw: 3.4, away_win: 4.16,
    over_15_goals: 1.39, over_25_goals: 2.21, over_35_goals: 4.05,
    under_15_goals: 2.89, under_25_goals: 1.65, under_35_goals: 1.22,
    btts_yes: 1.99, btts_no: 1.75,
  },
};

describe("matchClosingOdd (formato plano real da BSD)", () => {
  it("gols: acha a odd over da linha", () => {
    expect(matchClosingOdd(payload, "gols", 2.5)).toBe(2.21);
    expect(matchClosingOdd(payload, "gols", 1.5)).toBe(1.39);
    expect(matchClosingOdd(payload, "gols", 3.5)).toBe(4.05);
  });
  it("vitória: mandante por padrão, outcome p/ empate/visitante", () => {
    expect(matchClosingOdd(payload, "vitoria", 0.5)).toBe(1.91);
    expect(matchClosingOdd(payload, "vitoria", 0.5, "draw")).toBe(3.4);
    expect(matchClosingOdd(payload, "vitoria", 0.5, "away")).toBe(4.16);
  });
  it("retorna null quando a linha/mercado não existe", () => {
    expect(matchClosingOdd({ odds: {} }, "gols", 2.5)).toBeNull();
    expect(matchClosingOdd(payload, "escanteios", 9.5)).toBeNull();
  });
  it("tolera payload já desembrulhado e odd inválida", () => {
    expect(matchClosingOdd({ home_win: 1.8 }, "vitoria", 0.5)).toBe(1.8);
    expect(matchClosingOdd({ odds: { over_25_goals: 0.5 } }, "gols", 2.5)).toBeNull();
  });
});
