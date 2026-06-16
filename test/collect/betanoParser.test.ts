import { describe, it, expect } from "vitest";
import {
  parseBetano, parseBetanoEventList, betanoEventOddsUrl, betanoUpcomingUrl,
} from "../../src/collect/adapters/betano.js";
import { normalizeCollected } from "../../src/collect/normalizer.js";
import { BETANO_TABLE } from "../../src/collect/tables.js";

// Shape CRU REAL do Betano (plataforma PRÓPRIA www.betano.bet.br, fetch puro deslogado/BR).
// Recon de 2026-06-15 (França×Senegal, eventId 77353568). /api/odds = { data: { event: {
// markets: [...] } } } — markets ANINHADO (market tem selections[]), diferente de Stake/
// Superbet (array plano). Cada market: typeId (CHAVE de de-para, número global), name =
// "{Jogador} {Mercado em PT}" (jogador embutido → extrai removendo o sufixo PT), playerId.
// Cada selection: name="N+" (a LINHA over; "1+"=≥1=over0.5), price=odd, handicap (=0 em
// faltas → INÚTIL como linha; a linha vem do name). Liquidação Opta: desarmes "Total de
// Desarmes" = won_tackle (Opta conta tackle GANHO, não tentado — pesquisa web 2026-06-15),
// faltas "cometidas" = fouls committed. Ver docs/coleta-odds/casas/betano.md.
const sel = (name: string, price: number, handicap = 0) => ({
  id: `s-${name}`, name, price, handicap, betRef: `s-${name}`, typeId: 961,
});
const mkt = (typeId: number, name: string, playerId: string, selections: any[]) => ({
  id: `m-${typeId}-${playerId}`, uniqueId: `m-${typeId}-${playerId}`, name,
  type: "PLST", typeId, handicap: 0, displayOrder: 640, teamId: "106503",
  playerId, selections,
});

const realOdds = {
  data: {
    event: {
      id: "77353568", name: "França - Senegal", betRadarId: 66457006,
      leagueId: "201663", regionId: "189813",
      markets: [
        // ACEITOS — os 4 mercados de jogador (typeId = chave estável)
        mkt(596, "Bradley Barcola Chutes no gol", "19182639", [
          sel("1+", 1.42, 1), sel("2+", 2.90, 2), sel("3+", 7.10, 3),
        ]),
        mkt(595, "Bradley Barcola Total de chutes", "19182639", [
          sel("2+", 1.33, 2), sel("3+", 2.00, 3), sel("4+", 3.55, 4),
        ]),
        mkt(599, "Bradley Barcola Total de Desarmes", "19182639", [
          sel("1+", 1.13, 1), sel("2+", 1.67, 2), sel("3+", 3.05, 3),
        ]),
        // Faltas cometidas: handicap=0 em TODAS as selections → linha SÓ vem do name.
        mkt(1000679, "Bradley Barcola Faltas cometidas", "19182639", [
          sel("1+", 1.37, 0), sel("2+", 2.62, 0),
        ]),
        // segundo jogador (prova a extração de nome do prefixo de market.name)
        mkt(596, "Ousmane Dembélé Chutes no gol", "19182640", [
          sel("1+", 1.55, 1), sel("2+", 3.20, 2),
        ]),
        // REJEITADOS
        mkt(1000678, "Bradley Barcola Faltas ganhas", "19182639", [
          sel("1+", 1.27, 0), sel("2+", 2.18, 0),
        ]),
        mkt(1000681, "Bradley Barcola Chutes no gol - Primeiro Tempo", "19182639", [
          sel("1+", 2.40, 1),
        ]),
        mkt(593, "Bradley Barcola Total de Assistências", "19182639", [ // não mapeado
          sel("1+", 4.50, 1),
        ]),
      ],
    },
  },
};

describe("parseBetano (Betano) — markets aninhado, typeId chave, linha do selection.name N+", () => {
  it("aceita os 4 mercados de jogador com jogador/linha/odd certos", () => {
    const { linhas } = normalizeCollected(parseBetano(realOdds, "betano"), BETANO_TABLE);
    const k = (mt: string, l: number, ent: string) =>
      linhas.find((x) => x.market_type === mt && x.linha === l && x.entidade === ent);
    expect(k("sot", 0.5, "Bradley Barcola")).toMatchObject({ odd_over: 1.42, book: "betano" });
    expect(k("sot", 1.5, "Bradley Barcola")).toMatchObject({ odd_over: 2.90 });
    expect(k("finalizacoes", 1.5, "Bradley Barcola")).toMatchObject({ odd_over: 1.33 });
    expect(k("finalizacoes", 2.5, "Bradley Barcola")).toMatchObject({ odd_over: 2.00 });
    expect(k("desarmes", 0.5, "Bradley Barcola")).toMatchObject({ odd_over: 1.13 });
    expect(k("desarmes", 1.5, "Bradley Barcola")).toMatchObject({ odd_over: 1.67 });
  });

  it("FALTAS: linha vem do name (N+), NÃO do handicap (=0) — senão rejeitaria", () => {
    const { linhas } = normalizeCollected(parseBetano(realOdds, "betano"), BETANO_TABLE);
    expect(linhas.find((x) => x.market_type === "faltas" && x.linha === 0.5 && x.entidade === "Bradley Barcola")).toMatchObject({ odd_over: 1.37 });
    expect(linhas.find((x) => x.market_type === "faltas" && x.linha === 1.5 && x.entidade === "Bradley Barcola")).toMatchObject({ odd_over: 2.62 });
  });

  it("extrai o nome do jogador removendo o sufixo PT do mercado (2º jogador)", () => {
    const { linhas } = normalizeCollected(parseBetano(realOdds, "betano"), BETANO_TABLE);
    expect(linhas.find((x) => x.entidade === "Ousmane Dembélé" && x.linha === 0.5)).toMatchObject({ market_type: "sot", odd_over: 1.55 });
  });

  it("over-only (odd_under null)", () => {
    const { linhas } = normalizeCollected(parseBetano(realOdds, "betano"), BETANO_TABLE);
    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((x) => x.odd_under == null)).toBe(true);
  });

  it("rejeita faltas ganhas (1000678), primeiro tempo (1000681) e não-mapeado (593)", () => {
    const { linhas, linhas_rejeitadas } = normalizeCollected(parseBetano(realOdds, "betano"), BETANO_TABLE);
    expect(linhas.some((x) => x.market_type === "faltas" && x.entidade === "Bradley Barcola" && x.odd_over === 1.27)).toBe(false);
    expect(linhas_rejeitadas.some((r) => /sofrid/i.test(r.motivo))).toBe(true);          // faltas ganhas
    expect(linhas_rejeitadas.some((r) => /primeiro tempo|1º tempo/i.test(r.motivo))).toBe(true);
    expect(linhas_rejeitadas.some((r) => /não mapeado/i.test(r.motivo))).toBe(true);     // 593
  });
});

describe("parseBetanoEventList (crosswalk) — name 'A - B' em PT, id = slug/eventId", () => {
  it("→ {id: 'slug/eventId', home, away}", () => {
    const realList = {
      data: {
        events: [
          { id: "77353568", name: "França - Senegal", url: "/odds/franca-senegal/77353568/", betRadarId: 66457006 },
          { id: "77353570", name: "Irã - Nova Zelândia", url: "/odds/ira-nova-zelandia/77353570/" },
        ],
      },
    };
    const evs = parseBetanoEventList(realList);
    expect(evs).toHaveLength(2);
    expect(evs.find((e) => e.home === "França")).toMatchObject({ id: "franca-senegal/77353568", away: "Senegal" });
    expect(evs.find((e) => e.home === "Irã")).toMatchObject({ id: "ira-nova-zelandia/77353570", away: "Nova Zelândia" });
  });
});

describe("URLs do Betano (endpoints capturados, públicos/deslogado)", () => {
  it("odds de um jogo (slug/id, props de jogador ligados)", () => {
    expect(betanoEventOddsUrl("franca-senegal/77353568")).toBe(
      "https://www.betano.bet.br/api/odds/franca-senegal/77353568/?bt=3&isPlayersToggle=true&req=s,stnf,c,mb,mbl",
    );
  });
  it("lista de jogos upcoming (default = Copa 2026, leagueId 201663)", () => {
    expect(betanoUpcomingUrl()).toBe("https://www.betano.bet.br/api/league/hot/upcoming?leagueId=201663");
    expect(betanoUpcomingUrl("999")).toBe("https://www.betano.bet.br/api/league/hot/upcoming?leagueId=999");
  });
});
