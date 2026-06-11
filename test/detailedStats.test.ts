import { describe, it, expect } from "vitest";
import { detailedStats, formaTendencia } from "../src/model/detailedStats.js";

// jogos em ordem CRESCENTE (recente no fim), como o resto do motor
const g = (tackles: number, min: number, eventId: string, teamId = "T1") => ({
  total_tackle: tackles, minutes_played: min, event_id: eventId, team_id: teamId,
});

describe("detailedStats", () => {
  it("médias 5/10, últimos valores (recente primeiro) e minutos médios", () => {
    const games = [g(1, 90, "e1"), g(2, 90, "e2"), g(3, 80, "e3"), g(4, 90, "e4"), g(5, 70, "e5"), g(6, 90, "e6")];
    const s = detailedStats(games, "total_tackle");
    expect(s.media_5).toBeCloseTo((2 + 3 + 4 + 5 + 6) / 5, 9); // últimos 5
    expect(s.media_10).toBeCloseTo((1 + 2 + 3 + 4 + 5 + 6) / 6, 9); // só 6 jogos
    expect(s.ultimos_valores).toEqual([6, 5, 4, 3, 2]); // recente primeiro
    expect(s.minutos_medios).toBeCloseTo((90 + 90 + 80 + 90 + 70 + 90) / 6, 9);
  });

  it("split casa/fora vem do homeMap; jogo fora do mapa fica de fora do split", () => {
    const games = [g(2, 90, "e1"), g(4, 90, "e2"), g(6, 90, "e3")];
    const homeMap = new Map([["e1", "T1"], ["e2", "OUTRO"]]); // e3 desconhecido
    const s = detailedStats(games, "total_tackle", homeMap);
    expect(s.media_casa).toBeCloseTo(2, 9);
    expect(s.jogos_casa).toBe(1);
    expect(s.media_fora).toBeCloseTo(4, 9);
    expect(s.jogos_fora).toBe(1);
  });

  it("sem mapa → casa/fora null (nunca estima); sem jogos → tudo null/vazio", () => {
    const s1 = detailedStats([g(2, 90, "e1")], "total_tackle");
    expect(s1.media_casa).toBeNull();
    expect(s1.media_fora).toBeNull();
    const s0 = detailedStats([], "total_tackle");
    expect(s0.media_5).toBeNull();
    expect(s0.media_10).toBeNull();
    expect(s0.ultimos_valores).toEqual([]);
    expect(s0.minutos_medios).toBeNull();
    expect(s0.jogos_casa).toBe(0);
    expect(s0.jogos_fora).toBe(0);
  });

  it("stat ausente num jogo conta como 0 (não NaN)", () => {
    const games = [{ minutes_played: 90, event_id: "e1", team_id: "T1" }, g(4, 90, "e2")];
    const s = detailedStats(games, "total_tackle");
    expect(s.media_10).toBeCloseTo(2, 9);
  });
});

describe("formaTendencia (I5: rótulo descritivo, fora do money-path)", () => {
  const sd = (media_5: number | null, media_10: number | null, recentes = 5) => ({
    media_5, media_10, ultimos_valores: Array.from({ length: recentes }, () => 1),
    minutos_medios: 90, media_casa: null, media_fora: null, jogos_casa: 0, jogos_fora: 0,
  });

  it("últimos 5 acima dos 10 (≥ +15%) → 'em alta'", () => {
    expect(formaTendencia(sd(3.5, 2.5))).toBe("em alta"); // 1.4×
  });
  it("últimos 5 abaixo dos 10 (≤ -15%) → 'em queda'", () => {
    expect(formaTendencia(sd(2.0, 3.0))).toBe("em queda"); // 0.67×
  });
  it("dentro da faixa ±15% → 'estável'", () => {
    expect(formaTendencia(sd(2.6, 2.5))).toBe("estável"); // 1.04×
  });
  it("null: sem stats, média base nula/zero, ou amostra recente fraca (<3)", () => {
    expect(formaTendencia(null)).toBeNull();
    expect(formaTendencia(sd(3.0, null))).toBeNull();
    expect(formaTendencia(sd(3.0, 0))).toBeNull();
    expect(formaTendencia(sd(3.0, 2.0, 2))).toBeNull(); // só 2 jogos recentes
  });
});
