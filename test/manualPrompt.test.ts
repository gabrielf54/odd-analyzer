import { describe, it, expect } from "vitest";
import { buildOddsPrompt } from "../src/manual/prompt.js";

const lineup = {
  home: { team_name: "Germany", jogadores: [{ id: "10", name: "Kai Havertz" }] },
  away: { team_name: "Scotland", jogadores: [{ id: "20", name: "Joshua Kimmich" }] },
};

describe("buildOddsPrompt — formato compacto (pipe)", () => {
  it("mercado de jogador embute a lista de jogadores e pede só over", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "sot", lineup);
    expect(p).toContain("Kai Havertz");
    expect(p).toContain("Joshua Kimmich");
    expect(p).toMatch(/OVER|Mais de/i);
    expect(p).toContain("sot|"); // exemplo no formato compacto
    expect(p).toMatch(/não invente|OMITA/i);
    expect(p).not.toContain("odd_under"); // player path é só over
  });

  it("todo prompt pede SAÍDA compacta (sem JSON) com book no cabeçalho e campos por '|'", () => {
    for (const key of ["jogador", "partida", "sot", "escanteios", "vitoria"]) {
      const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, key, lineup);
      expect(p, key).toMatch(/book=/);
      expect(p, key).toContain("|");
      expect(p, key).toMatch(/NADA de JSON|formato compacto|sem JSON/i);
      expect(p, key).not.toMatch(/APENAS JSON/); // não pede mais array JSON
    }
  });

  it("mercado de partida (totais) pede os dois lados e não embute jogadores", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "escanteios", lineup);
    expect(p).not.toContain("Kai Havertz");
    expect(p).toMatch(/over.*under|Mais.*Menos/i);
    expect(p).toContain("escanteios|");
    expect(p).toContain("odd_under"); // o segundo lado vai no exemplo compacto
  });

  it("vitoria pede uma entrada por resultado, sem linha", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "vitoria", lineup);
    expect(p).toContain("vitoria|");
    expect(p).toMatch(/empate/i);
    expect(p).not.toContain("odd_under");
  });

  it("todos os prompts instruem cortar odds altas (≥ 10) pra não estourar a resposta", () => {
    for (const key of ["jogador", "partida", "sot", "escanteios", "vitoria"]) {
      const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, key, lineup);
      expect(p, key).toMatch(/odd ≥ 10/);
    }
  });

  it("mercado desconhecido lança", () => {
    expect(() => buildOddsPrompt({ jogo: "x" }, "cartoes", lineup)).toThrow(/desconhecido/);
  });

  it("faltas e passes (jogador) roteiam como mercado de JOGADOR, não de partida", () => {
    for (const key of ["faltas", "passes"]) {
      const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, key, lineup);
      expect(p, key).toContain("Kai Havertz"); // embute a lista → é player
      expect(p, key).toContain(`${key}|`);
      expect(p, key).not.toContain("odd_under"); // player path é só over
    }
  });

  it("grupo 'jogador': lista + 5 mercados, modelo coluna N+ e matching normalizado", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "jogador", lineup);
    expect(p).toContain("Kai Havertz");
    expect(p).toContain("Joshua Kimmich");
    expect(p).toContain("sot|");
    expect(p).toContain("finalizacoes|");
    expect(p).toContain("desarmes|");
    expect(p).toContain("faltas|");
    expect(p).toContain("passes|");
    // bet365: linhas são colunas-limiar "N+", não "Mais de X.5"
    expect(p).toMatch(/2\+/);
    // normalização de acento/islandês continua
    expect(p).toMatch(/þ→th|acento/i);
    // mercados opcionais (desarmes pode não existir no jogo)
    expect(p).toMatch(/OPCIONAIS|não tiver|OMITA/);
  });

  it("grupo 'jogador': alias do nome-da-casa com '^' SÓ quando difere do meu nome", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "jogador", lineup);
    expect(p).toContain("^"); // convenção entidade^nome_da_casa
    expect(p).toMatch(/difere|diferente|igual/i); // condicional "só quando difere"
    // campos mortos foram removidos da saída
    expect(p).not.toContain("linha_label");
    expect(p).not.toContain("market_label_casa");
  });

  it("grupo 'partida': UM prompt com gols + escanteios + vitoria, 2 lados nos totais", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland" }, "partida", lineup);
    expect(p).toContain("gols|");
    expect(p).toContain("escanteios|");
    expect(p).toContain("vitoria|");
    expect(p).toContain("odd_under");
    expect(p).not.toContain("Kai Havertz");
  });

  it("grupo 'tudo': UM prompt cobre os 8 mercados (partida + jogador) do jogo", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland", home_team: "Germany", away_team: "Scotland" }, "tudo", lineup);
    // partida
    expect(p).toContain("gols|");
    expect(p).toContain("escanteios|");
    expect(p).toContain("vitoria|");
    expect(p).toContain("odd_under"); // totais de partida têm 2 lados
    // jogador
    for (const m of ["sot", "finalizacoes", "desarmes", "faltas", "passes"]) {
      expect(p, m).toContain(`${m}|`);
    }
    expect(p).toContain("Kai Havertz"); // embute a lista de jogadores
    expect(p).toContain("Joshua Kimmich");
    expect(p).toContain("^"); // alias entidade^nome_da_casa do bloco jogador
  });

  it("grupo 'tudo': UM ÚNICO header book= (não repete por família)", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland", home_team: "Germany", away_team: "Scotland" }, "tudo", lineup);
    const headers = p.match(/^book=/gm) ?? [];
    expect(headers.length).toBe(1);
  });

  it("grupo 'tudo': saída compacta (sem JSON) e corta odds ≥ 10", () => {
    const p = buildOddsPrompt({ jogo: "Germany x Scotland", home_team: "Germany", away_team: "Scotland" }, "tudo", lineup);
    expect(p).toMatch(/NADA de JSON|formato compacto|sem JSON/i);
    expect(p).not.toMatch(/APENAS JSON/);
    expect(p).toMatch(/odd ≥ 10/);
  });
});
