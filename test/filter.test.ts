import { describe, it, expect } from "vitest";
import { filterCandidates, evaluateCandidates, CUTS_DEFAULT } from "../src/candidates/filter.js";

const cand = (over: Partial<Record<string, unknown>>) => ({
  jogador: "X", linha: 1.5, edge: 0.05, ev: 0.06, xi_confirmado: true, amostra_jogos: 12, ...over,
});

describe("filterCandidates", () => {
  it("mantém só quem passa edge/ev/xi/amostra e ordena por ev desc", () => {
    const cands = [
      cand({ ev: 0.06 }),
      cand({ ev: 0.10 }),
      cand({ edge: 0.01 }),          // reprovado: edge baixo
      cand({ xi_confirmado: false }), // reprovado: não confirmado
      cand({ amostra_jogos: 5 }),     // reprovado: amostra pequena
    ];
    const out = filterCandidates(cands, CUTS_DEFAULT);
    expect(out).toHaveLength(2);
    expect(out[0]!["ev"]).toBe(0.10); // ordenado desc
  });

  it("lista vazia é resultado válido", () => {
    expect(filterCandidates([cand({ edge: 0.0, ev: 0.0 })], CUTS_DEFAULT)).toEqual([]);
  });
});

describe("evaluateCandidates (diagnóstico)", () => {
  it("separa aprovados de reprovados e ordena aprovados por ev desc", () => {
    const cands = [
      cand({ ev: 0.06 }),
      cand({ ev: 0.10 }),
      cand({ edge: 0.01 }),
      cand({ xi_confirmado: false }),
      cand({ amostra_jogos: 5 }),
    ];
    const { approved, rejected } = evaluateCandidates(cands, CUTS_DEFAULT);
    expect(approved).toHaveLength(2);
    expect(approved[0]!["ev"]).toBe(0.10);
    expect(rejected).toHaveLength(3);
  });

  it("acumula um motivo por corte falhado, com a métrica real", () => {
    const [r] = evaluateCandidates([cand({ edge: 0.01, ev: 0.0 })], CUTS_DEFAULT).rejected;
    expect(r!.motivos).toContain("edge");
    expect(r!.motivos).toContain("ev");
    expect(r!.edge).toBe(0.01); // métrica real preservada
  });

  it("um candidato pode reprovar por vários cortes ao mesmo tempo", () => {
    const [r] = evaluateCandidates(
      [cand({ edge: 0, ev: 0, xi_confirmado: false, amostra_jogos: 2 })],
      CUTS_DEFAULT,
    ).rejected;
    expect(r!.motivos.sort()).toEqual(["amostra", "edge", "ev", "titular"]);
  });
});
