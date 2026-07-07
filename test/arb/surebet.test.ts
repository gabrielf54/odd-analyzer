// Motor de ARBITRAGEM (surebet): dado o `odds` CRU de um evento (todas as casas),
// acha pares/trincas de lados opostos cuja soma dos inversos < 1 (lucro travado) e
// calcula o split de stake. PURO — sem I/O. Ver docs/features/arbitragem-surebet.
import { describe, it, expect } from "vitest";
import { findArbs, type ArbOddsRow } from "../../src/arb/surebet.js";

const T0 = "2026-07-06T10:00:00.000Z";

function row(partial: Partial<ArbOddsRow>): ArbOddsRow {
  return {
    event_id: "8380", entidade: "partida", market_type: "gols", linha: 2.5,
    odd_over: 2.0, odd_under: null, odd_draw: null, book: "kto", coletado_em: T0,
    ...partial,
  };
}

describe("findArbs — 2 vias (over/under)", () => {
  it("acha arbitragem quando melhor over × melhor under cruzam abaixo de 1", () => {
    const rows = [
      row({ book: "betano", odd_over: 2.05, odd_under: 1.7 }),
      row({ book: "kto", odd_over: 1.72, odd_under: 2.1 }),
    ];
    const out = findArbs(rows, { total: 200 });
    expect(out).toHaveLength(1);
    const a = out[0]!;
    expect(a.tipo).toBe("2vias");
    expect(a.tier).toBe("imperdivel");
    expect(a.soma_inversos).toBeCloseTo(1 / 2.05 + 1 / 2.1, 6);
    expect(a.pernas.map((p) => p.book)).toEqual(["betano", "kto"]); // over, under
    expect(a.pernas.map((p) => p.lado)).toEqual(["over", "under"]);
    // stakes inteiros somando exatamente o total
    expect(a.pernas.reduce((s, p) => s + p.stake, 0)).toBe(200);
    for (const p of a.pernas) expect(Number.isInteger(p.stake)).toBe(true);
    // lucro do PIOR cenário após arredondar, positivo
    const worst = Math.min(...a.pernas.map((p) => p.stake * p.odd));
    expect(a.lucro_garantido).toBeCloseTo(worst - 200, 6);
    expect(a.lucro_garantido).toBeGreaterThan(0);
    expect(a.lucro_pct).toBeCloseTo((a.lucro_garantido / 200) * 100, 6);
  });

  it("não pareia linhas diferentes (over 2.5 nunca casa com under 3.5)", () => {
    const rows = [
      row({ book: "betano", linha: 2.5, odd_over: 2.05 }),
      row({ book: "kto", linha: 3.5, odd_over: 1.3, odd_under: 3.5 }),
    ];
    // grupo 2.5 não tem under; grupo 3.5 tem os dois lados mas S=1/1.3+1/3.5≈1.055 > quase
    expect(findArbs(rows)).toHaveLength(0);
  });

  it("agrupa entidade por identidade normalizada (Llorente, Marcos = Marcos Llorente)", () => {
    const rows = [
      row({ book: "superbet", market_type: "sot", entidade: "Llorente, Marcos", linha: 0.5, odd_over: 2.3 }),
      row({ book: "kto", market_type: "sot", entidade: "Marcos Llorente", linha: 0.5, odd_over: 1.5, odd_under: 2.4 }),
    ];
    const out = findArbs(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.pernas[0]!.book).toBe("superbet");
    expect(out[0]!.pernas[1]!.book).toBe("kto");
  });

  it("grupo só-over (escada sem under em casa alguma) é ignorado", () => {
    const rows = [
      row({ book: "betano", odd_over: 2.05 }),
      row({ book: "stake", odd_over: 2.1 }),
    ];
    expect(findArbs(rows)).toHaveLength(0);
  });

  it("tier quase: 1 <= S < 1.02 aparece como radar, sem lucro garantido", () => {
    // S = 1/2.0 + 1/1.98 = 0.5 + 0.50505 = 1.00505
    const rows = [
      row({ book: "betano", odd_over: 2.0 }),
      row({ book: "kto", odd_over: 1.5, odd_under: 1.98 }),
    ];
    const out = findArbs(rows);
    expect(out).toHaveLength(1);
    expect(out[0]!.tier).toBe("quase");
    expect(out[0]!.lucro_garantido).toBeLessThanOrEqual(0);
  });

  it("S >= 1.02 é descartado", () => {
    const rows = [
      row({ book: "betano", odd_over: 1.9 }),
      row({ book: "kto", odd_over: 1.5, odd_under: 1.9 }),
    ];
    expect(findArbs(rows)).toHaveLength(0);
  });

  it("arb teórica que o arredondamento come degrada para quase", () => {
    // S = 1/2.0 + 1/2.005 = 0.99875 → lucro teórico ~R$0.25 em T=200; inteiros comem
    const rows = [
      row({ book: "betano", odd_over: 2.0 }),
      row({ book: "kto", odd_over: 1.5, odd_under: 2.005 }),
    ];
    const out = findArbs(rows, { total: 200 });
    expect(out).toHaveLength(1);
    if (out[0]!.lucro_garantido <= 0) expect(out[0]!.tier).toBe("quase");
    else expect(out[0]!.tier).toBe("imperdivel");
  });

  it("defasagem_min = distância entre a perna mais velha e a mais nova", () => {
    const rows = [
      row({ book: "betano", odd_over: 2.05, coletado_em: "2026-07-06T10:00:00.000Z" }),
      row({ book: "kto", odd_over: 1.5, odd_under: 2.1, coletado_em: "2026-07-06T10:30:00.000Z" }),
    ];
    const out = findArbs(rows);
    expect(out[0]!.defasagem_min).toBe(30);
  });
});

describe("findArbs — 3 vias (1X2 com odd_draw)", () => {
  it("acha arbitragem cruzando casa/empate/fora de casas diferentes", () => {
    const rows = [
      row({ market_type: "vitoria", linha: 0, book: "kto", odd_over: 3.0, odd_under: 2.9, odd_draw: 3.1 }),
      row({ market_type: "vitoria", linha: 0, book: "stake", odd_over: 2.8, odd_under: 3.4, odd_draw: 3.2 }),
      row({ market_type: "vitoria", linha: 0, book: "superbet", odd_over: 2.9, odd_under: 3.0, odd_draw: 3.5 }),
    ];
    const out = findArbs(rows, { total: 200 });
    expect(out).toHaveLength(1);
    const a = out[0]!;
    expect(a.tipo).toBe("3vias");
    expect(a.tier).toBe("imperdivel");
    expect(a.soma_inversos).toBeCloseTo(1 / 3.0 + 1 / 3.5 + 1 / 3.4, 6);
    expect(a.pernas.map((p) => p.lado)).toEqual(["casa", "empate", "fora"]);
    expect(a.pernas.map((p) => p.book)).toEqual(["kto", "superbet", "stake"]);
    expect(a.pernas.reduce((s, p) => s + p.stake, 0)).toBe(200);
    expect(a.lucro_garantido).toBeGreaterThan(0);
  });

  it("vitoria NUNCA vira 2-vias (sem draw em casa alguma → nada)", () => {
    const rows = [
      row({ market_type: "vitoria", linha: 0, book: "kto", odd_over: 3.0, odd_under: 2.9 }),
      row({ market_type: "vitoria", linha: 0, book: "stake", odd_over: 2.8, odd_under: 3.4 }),
    ];
    expect(findArbs(rows)).toHaveLength(0);
  });
});

describe("findArbs — saída", () => {
  it("ordena por soma_inversos crescente (melhor primeiro) e carrega rótulos leigos", () => {
    const rows = [
      // quase (S≈1.005)
      row({ book: "betano", odd_over: 2.0 }),
      row({ book: "kto", odd_over: 1.5, odd_under: 1.98 }),
      // imperdível em escanteios 9.5 (S≈0.964)
      row({ market_type: "escanteios", linha: 9.5, book: "betnacional", odd_over: 2.05 }),
      row({ market_type: "escanteios", linha: 9.5, book: "superbet", odd_over: 1.6, odd_under: 2.1 }),
    ];
    const out = findArbs(rows);
    expect(out).toHaveLength(2);
    expect(out[0]!.market_type).toBe("escanteios");
    expect(out[0]!.soma_inversos).toBeLessThan(out[1]!.soma_inversos);
    expect(out[0]!.pernas[0]!.rotulo).toBe("Mais de 9.5 escanteios");
    expect(out[0]!.pernas[1]!.rotulo).toBe("Menos de 9.5 escanteios");
  });

  it("total default é 200 e eventos diferentes não se misturam", () => {
    const rows = [
      row({ event_id: "1", book: "betano", odd_over: 2.05 }),
      row({ event_id: "2", book: "kto", odd_over: 1.5, odd_under: 2.1 }),
    ];
    expect(findArbs(rows)).toHaveLength(0); // mesmo mercado/linha, jogos diferentes
  });
});
