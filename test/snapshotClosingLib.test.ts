import { describe, it, expect } from "vitest";
import { matchClosingOdd, withinClosingWindow } from "../src/cli/snapshotClosingLib.js";

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

describe("withinClosingWindow (só captura perto do apito)", () => {
  const now = Date.parse("2026-06-16T18:30:00Z"); // 15h30 BRT
  const k = (h: number, m = 0) => Date.parse(`2026-06-16T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`);
  it("jogo das 16h BRT (19h UTC = 30min à frente) → DENTRO", () => {
    expect(withinClosingWindow(k(19), now)).toBe(true);
  });
  it("jogo das 22h BRT (01h UTC dia seguinte, ~6h30 à frente) → FORA (cedo demais)", () => {
    expect(withinClosingWindow(Date.parse("2026-06-17T01:00:00Z"), now)).toBe(false);
  });
  it("jogo que começou há 10min → ainda dentro da graça; há 30min → fora", () => {
    expect(withinClosingWindow(k(18, 20), now)).toBe(true);  // -10min
    expect(withinClosingWindow(k(18, 0), now)).toBe(false);  // -30min
  });
  it("data inválida → false", () => {
    expect(withinClosingWindow(NaN, now)).toBe(false);
  });
});
