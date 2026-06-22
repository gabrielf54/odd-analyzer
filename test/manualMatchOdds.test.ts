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
  it("entende 'Sobrenome, Nome' (vírgula, formato Betnacional) como o mesmo jogador", () => {
    expect(scoreName("Havertz, Kai", "Kai Havertz")).toBeGreaterThan(0.9);
    expect(scoreName("Kimmich, Joshua", "Joshua Kimmich")).toBeGreaterThan(0.9);
  });
  it("nome mononímico da casa (Gavi) casa o completo da fonte (Pablo Gavi)", () => {
    expect(scoreName("Gavi", "Pablo Gavi")).toBeGreaterThan(0.9);
    expect(scoreName("Stopira", "Ianique Stopira")).toBeGreaterThan(0.9);
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

  it("formato 'Sobrenome, Nome' casa igual ao 'Nome Sobrenome' (Betnacional não vira sem_match)", () => {
    const r = matchPlayerOdds([line("Havertz, Kai")], squad, {});
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0]!.player_id).toBe("10");
    expect(r.sem_match).toHaveLength(0);
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

describe("matchPlayerOdds — auto-link com revisão (limiar 0.75)", () => {
  // "Ali Youssef" vs "Ali Yousif" pontua ~0.77 (transliteração): cai na faixa de
  // auto-link COM revisão [0.75, 0.85). O 2º candidato está longe → não-ambíguo.
  const transliterado = [
    { id: "1", name: "Ali Yousif" },
    { id: "2", name: "Ahmed Hassan" },
  ];

  it("nome certo em [0.75,0.85) casa SOZINHO e entra em auto_ligados (revisar)", () => {
    const r = matchPlayerOdds([line("Ali Youssef")], transliterado, {});
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0]!.player_id).toBe("1");
    expect(r.sem_match).toHaveLength(0);
    expect(r.auto_ligados).toHaveLength(1);
    expect(r.auto_ligados[0]!.nome_casa).toBe("Ali Youssef");
    expect(r.auto_ligados[0]!.player_id).toBe("1");
    expect(r.auto_ligados[0]!.confianca).toBeGreaterThanOrEqual(0.75);
    expect(r.auto_ligados[0]!.confianca).toBeLessThan(0.85);
    // carrega os parecidos pra UI de "corrigir"
    expect(r.auto_ligados[0]!.candidatos.length).toBeGreaterThan(0);
  });

  it("match muito alto (>=0.85) casa SILENCIOSO — fora de auto_ligados", () => {
    const r = matchPlayerOdds([line("K. Havertz")], squad, {});
    expect(r.casados).toHaveLength(1);
    expect(r.casados[0]!.player_id).toBe("10");
    expect(r.auto_ligados).toHaveLength(0);
    expect(r.sem_match).toHaveLength(0);
  });

  it("nome certo porém baixo (<0.75) NÃO auto-liga — vai pra sem_match", () => {
    // "Manaf Younis" vs "Munaf Younus" ~0.55: abaixo do piso, decisão fica do operador.
    const r = matchPlayerOdds([line("Manaf Younis")], [{ id: "9", name: "Munaf Younus" }], {});
    expect(r.casados).toHaveLength(0);
    expect(r.auto_ligados).toHaveLength(0);
    expect(r.sem_match).toHaveLength(1);
  });

  it("ambíguo na faixa nova (dois ~0.77) continua fail-closed → sem_match", () => {
    const doisParecidos = [
      { id: "1", name: "Ali Yousif" },
      { id: "2", name: "Ali Yousof" },
    ];
    const r = matchPlayerOdds([line("Ali Youssef")], doisParecidos, {});
    expect(r.casados).toHaveLength(0);
    expect(r.auto_ligados).toHaveLength(0);
    expect(r.sem_match).toHaveLength(1);
  });
});
