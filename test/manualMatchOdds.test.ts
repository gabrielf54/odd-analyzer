import { describe, it, expect } from "vitest";
import { matchPlayerOdds, scoreName } from "../src/manual/matchOdds.js";
import type { ManualOddsLine } from "../src/manual/schema.js";

const squad = [
  { id: "10", name: "Kai Havertz" },
  { id: "20", name: "Joshua Kimmich" },
];
const line = (entidade: string): ManualOddsLine =>
  ({ market_type: "sot", entidade, linha: 0.5, odd_over: 2.0, odd_under: null, book: "b" });

describe("scoreName", () => {
  it("casa nome abreviado pelo sobrenome (~1.0)", () => {
    expect(scoreName("K. Havertz", "Kai Havertz")).toBeGreaterThan(0.9);
    expect(scoreName("J. Kimmich", "Joshua Kimmich")).toBeGreaterThan(0.9);
  });
  it("nomes distintos pontuam baixo", () => {
    expect(scoreName("Cristiano Ronaldo", "Kai Havertz")).toBeLessThan(0.3);
  });
});

describe("matchPlayerOdds", () => {
  it("nome abreviado óbvio casa e leva o player_id do squad", () => {
    const r = matchPlayerOdds([line("K. Havertz")], squad, {});
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0]!.player_id).toBe("10");
    expect(r.sem_match).toHaveLength(0);
  });

  it("nome desconhecido vira sem_match com candidatos ranqueados", () => {
    const r = matchPlayerOdds([line("Cristiano Ronaldo")], squad, {});
    expect(r.casados).toHaveLength(0);
    expect(r.sem_match).toHaveLength(1);
    expect(r.sem_match[0]!.nome_casa).toBe("Cristiano Ronaldo");
    expect(r.sem_match[0]!.candidatos.length).toBeGreaterThan(0);
  });

  it("override (crosswalk salvo) casa direto por nome normalizado", () => {
    const r = matchPlayerOdds([line("CR7")], squad, { cr7: "20" });
    expect(r.casados[0]!.player_id).toBe("20");
  });

  it("sobrenome ambíguo (dois iguais) NÃO auto-casa — vai pra sem_match", () => {
    const ambiguo = [{ id: "1", name: "Thiago Silva" }, { id: "2", name: "Bruno Silva" }];
    const r = matchPlayerOdds([line("Silva")], ambiguo, {});
    expect(r.casados).toHaveLength(0);
    expect(r.sem_match).toHaveLength(1);
    expect(r.sem_match[0]!.candidatos.length).toBe(2);
  });

  it("sobrenome compartilhado mas nome completo dado: desambigua pelo 1º nome e casa", () => {
    // Argentina tem Emiliano E Lautaro Martínez. Sobrenome igual não pode empatar
    // quando a casa manda o nome completo "Lautaro Martínez".
    const argentinos = [
      { id: "1629", name: "Emiliano Martínez" },
      { id: "1687", name: "Lautaro Martínez" },
      { id: "2826", name: "Máximo Perrone" },
    ];
    const r = matchPlayerOdds([line("Lautaro Martínez")], argentinos, {});
    expect(r.sem_match).toHaveLength(0);
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0]!.player_id).toBe("1687");
  });
});
