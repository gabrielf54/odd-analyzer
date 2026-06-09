import { describe, it, expect } from "vitest";
import { parseManualOdds } from "../src/manual/schema.js";

describe("parseManualOdds", () => {
  const base = { event_id: "e1", coletado_em: "2026-06-14T18:30:00Z" };

  it("aceita linha de jogador só com over", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 2.1, book: "bet365" },
    ] });
    expect(r.odds).toHaveLength(1);
    expect(r.odds[0]!.odd_under).toBeNull();
    expect(r.linhas_rejeitadas).toHaveLength(0);
  });

  it("rejeita odd <= 1.01 sem derrubar o resto", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "sot", entidade: "X", linha: 0.5, odd_over: 1.0, book: "b" },
      { market_type: "sot", entidade: "Y", linha: 0.5, odd_over: 2.0, book: "b" },
    ] });
    expect(r.odds).toHaveLength(1);
    expect(r.linhas_rejeitadas).toHaveLength(1);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/odd_over/);
  });

  it("rejeita mercado de partida (totais) sem os dois lados", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "escanteios", entidade: "partida", linha: 9.5, odd_over: 1.9, book: "b" },
    ] });
    expect(r.odds).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/dois lados/);
  });

  it("rejeita market_type desconhecido", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "cartoes", entidade: "X", linha: 0.5, odd_over: 2.0, book: "b" },
    ] });
    expect(r.odds).toHaveLength(0);
    expect(r.linhas_rejeitadas[0]!.motivo).toMatch(/market_type/);
  });

  it("aceita vitoria (1x2) só com over, sem under nem linha", () => {
    const r = parseManualOdds({ ...base, odds: [
      { market_type: "vitoria", entidade: "Germany", odd_over: 1.75, book: "b" },
    ] });
    expect(r.odds).toHaveLength(1);
    expect(r.linhas_rejeitadas).toHaveLength(0);
  });

  it("body sem coletado_em lança", () => {
    expect(() => parseManualOdds({ event_id: "e1", odds: [] })).toThrow();
  });
});
