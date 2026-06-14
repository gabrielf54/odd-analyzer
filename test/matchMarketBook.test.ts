import { describe, it, expect } from "vitest";
import { matchCount } from "../src/pipeline.js";
import { MARKETS } from "../src/model/markets.js";

// Mercados de PARTIDA (gols/escanteios) agora carregam book + casas_comparadas até o
// candidato (line shopping) — antes só os de jogador carregavam.
describe("matchCount propaga book/casas_comparadas (line shopping em partida)", () => {
  const sp = { async teamRate() { return { mu: 1.2, amostra_jogos: 6, incerteza: "media" }; } };
  const event = { id: "e1", jogo: "A x B", home_team: { id: "1", name: "A" }, away_team: { id: "2", name: "B" } };

  it("o candidato leva o book vencedor e as casas comparadas da linha", async () => {
    const lines = [{
      entidade: "partida", linha: 2.5, odd_over: 1.95, odd_under: 1.9, book: "Betano",
      casas_comparadas: [{ book: "Betano", odd_over: 1.95 }, { book: "betnacional", odd_over: 1.88 }],
    }];
    const cands = await matchCount(event, MARKETS.gols!, sp, lines);
    expect(cands).toHaveLength(1);
    expect(cands[0]!.book).toBe("Betano");
    expect(cands[0]!.casas_comparadas).toHaveLength(2);
  });

  it("sem book na linha → null (não quebra)", async () => {
    const cands = await matchCount(event, MARKETS.gols!, sp, [{ entidade: "partida", linha: 2.5, odd_over: 1.9, odd_under: 1.9 }]);
    expect(cands[0]!.book ?? null).toBeNull();
    expect(cands[0]!.casas_comparadas ?? null).toBeNull();
  });
});
