import { describe, it, expect } from "vitest";
import { normalize, matchPlayer } from "../src/crosswalk/match.js";
import { buildTeamMap, resolve } from "../src/crosswalk/bsdIds.js";

describe("crosswalk/match", () => {
  it("normalize remove acento e caixa", () => {
    expect(normalize("Côte d'Ivoire")).toBe("cote d'ivoire");
    expect(normalize("  Kaiki   Fernandes ")).toBe("kaiki fernandes");
  });

  it("normalize inverte 'Sobrenome, Nome' → 'nome sobrenome' (formato Betnacional)", () => {
    expect(normalize("Torres, Ferran")).toBe("ferran torres");
    expect(normalize("Cucurella, Marc")).toBe("marc cucurella");
    expect(normalize("Lopes Cabral, Sidny")).toBe("sidny lopes cabral");
    // mesma pessoa nas três grafias → mesma normalização (dedup do sem_match conta 1)
    expect(normalize("Baena, Alex")).toBe(normalize("Álex Baena"));
  });

  it("matchPlayer casa por similaridade", () => {
    const elenco = [{ id: "7", name: "Kaiki Fernandes" }, { id: "9", name: "João Silva" }];
    const m = matchPlayer("Kaiki Fernandes", elenco, null, 0.8);
    expect(m?.id).toBe("7");
    expect(m?.confianca).toBe(1.0);
  });

  it("matchPlayer fail-closed: sem match acima do threshold → null", () => {
    const elenco = [{ id: "9", name: "João Silva" }];
    expect(matchPlayer("Cristiano Ronaldo", elenco, null, 0.9)).toBeNull();
  });

  it("matchPlayer respeita overrides", () => {
    const elenco = [{ id: "7", name: "Kaiki Fernandes" }];
    const m = matchPlayer("K. Fernandes", elenco, { "K. Fernandes": "7" }, 0.99);
    expect(m?.id).toBe("7");
    expect(m?.confianca).toBe(1.0);
  });
});

describe("crosswalk/bsdIds", () => {
  const client = {
    async events() { return { results: [{ id: "e1" }] }; },
    async eventPlayerStats() {
      return { player_stats: [{ player_id: 100, team_id: "T" }, { player_id: 101, team_id: "T" }] };
    },
    async player(pid: unknown) { return { name: pid === 100 ? "Kaiki Fernandes" : "Joao Silva" }; },
  };

  it("buildTeamMap monta [{id,name,posicao}] dedup", async () => {
    const mapa = await buildTeamMap(client, "T", 5);
    expect(mapa).toEqual([
      { id: "100", name: "Kaiki Fernandes", posicao: "" },
      { id: "101", name: "Joao Silva", posicao: "" },
    ]);
  });

  it("resolve troca id da escalação pelo stats-id casado", async () => {
    const mapa = await buildTeamMap(client, "T", 5);
    const escalacao = [{ id: "999", name: "Kaiki Fernandes", team_id: "T", posicao: "DF" }];
    const out = resolve(escalacao, mapa, 0.8);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("100");
    expect(out[0]!.posicao).toBe("DF");
  });

  it("resolve descarta quem não casa (fail-closed)", async () => {
    const mapa = await buildTeamMap(client, "T", 5);
    const escalacao = [{ id: "999", name: "Zinedine Zidane", team_id: "T" }];
    expect(resolve(escalacao, mapa, 0.9)).toEqual([]);
  });

  // SELEÇÃO: o pool nacional traz o elenco com stats-id direto. Reconstruir de jogos
  // finalizados é raso p/ seleção (squad de seleção vem vazio) → 0 candidatos na Copa.
  it("buildTeamMap usa nationalPool quando há elenco (sem reconstruir de jogos)", async () => {
    const selecao = {
      async nationalPool() { return { results: [{ id: 100, name: "Kai Havertz" }, { id: 101, name: "Joshua Kimmich" }] }; },
      async events() { throw new Error("não deve consultar events quando o pool nacional tem elenco"); },
      async eventPlayerStats() { return { player_stats: [] }; },
      async player() { return { name: "x" }; },
    };
    const mapa = await buildTeamMap(selecao, "467", 5);
    expect(mapa).toEqual([
      { id: "100", name: "Kai Havertz", posicao: "" },
      { id: "101", name: "Joshua Kimmich", posicao: "" },
    ]);
  });

  it("resolve casa nome ABREVIADO da escalação (J. Kimmich) ao completo do pool", async () => {
    // lineups trazem nome abreviado; o pool nacional traz completo. Sem tolerância a
    // inicial, o crosswalk falha e a seleção dá 0 candidatos.
    const map = [{ id: "2462", name: "Joshua Kimmich" }, { id: "999", name: "Kai Havertz" }];
    const lineup = [{ id: "L1", name: "J. Kimmich", team_id: "467", posicao: "M" }];
    const out = resolve(lineup, map, 0.85);
    expect(out).toHaveLength(1);
    expect(out[0]!.id).toBe("2462");
    expect(out[0]!.posicao).toBe("M");
  });

  it("buildTeamMap cai no events path quando o pool nacional vem vazio (clube)", async () => {
    const clube = {
      async nationalPool() { return { results: [] }; }, // clube → pool vazio
      ...client,
    };
    const mapa = await buildTeamMap(clube, "T", 5);
    expect(mapa).toEqual([
      { id: "100", name: "Kaiki Fernandes", posicao: "" },
      { id: "101", name: "Joao Silva", posicao: "" },
    ]);
  });
});
