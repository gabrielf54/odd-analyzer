import { describe, it, expect } from "vitest";
import { parseSuperbet, parseSuperbetEventList } from "../../src/collect/adapters/superbet.js";
import { normalizeCollected } from "../../src/collect/normalizer.js";
import { SUPERBET_TABLE } from "../../src/collect/tables.js";

// Shape CRU REAL do evento 12512182 (Suécia×Tunísia, 2026-06-15, deslogado, BR). Wrapper
// {error, data:[{...evento..., odds:[...]}]}; data[0].odds é array PLANO de seleções; cada
// seleção carrega o próprio marketId/marketName. Linha em specifiers.total (campo numérico
// limpo), jogador em specifiers.player_name e extra["replaced-spec-player_name"] (nome
// cheio). Chave de de-para = marketId (code é null; não há rótulo EN). hasUnder=false (escada).
const mk = (marketId: number, marketName: string, short: string, full: string, total: string, price: number) => ({
  uuid: `u-${marketId}-${short}-${total}`, marketUuid: `m-${marketId}`, marketId, outcomeId: 1, price,
  specialBetValue: `sr:player:1-${short}-${total}`, status: "active",
  specifiers: { total, player_id: "sr:player:1", player_name: short },
  showSpecialBetValue: "0",
  extra: { "universal-player-id": "universal:player:abc", "replaced-spec-player_name": full, "betradar-player-id": "sr:player:1", team: "1" },
  name: `${short} - Mais de ${total}`, marketName, info: `Mais de ${total}`,
});
const teamMk = (marketId: number, marketName: string, price: number) => ({
  marketId, outcomeId: 1, price, status: "active", name: marketName, marketName, info: marketName,
});

const real = {
  error: false,
  dataIn: { lang: "pt-BR", eventId: 12512182 },
  data: [{
    eventId: 12512182, matchName: "Suécia·Tunísia", tournamentId: 1434,
    odds: [
      // ACEITOS — os 4 mercados alvo
      mk(236220, "Jogador - Chutes no Gol", "Ali, Taha", "Ali, Taha Abdi", "0.5", 1.61),
      mk(236220, "Jogador - Chutes no Gol", "Ali, Taha", "Ali, Taha Abdi", "1.5", 3.8),
      mk(236220, "Jogador - Chutes no Gol", "Ali, Taha", "Ali, Taha Abdi", "2.5", 9.6),
      mk(236218, "Jogador - Finalizações", "Bronn, Dylan", "Dylan Bronn", "1.5", 2.1),
      mk(236222, "Jogador - Total de Desarmes", "Bronn, Dylan", "Dylan Bronn", "0.5", 1.45),
      mk(236216, "Jogador - Faltas Cometidas", "Ali, Taha", "Ali, Taha Abdi", "0.5", 1.37),
      // REJEITADOS
      mk(238449, "Jogador - Faltas Sofridas", "Ali, Taha", "Ali, Taha Abdi", "0.5", 1.5),            // sofridas
      mk(238450, "Jogador - Total de Vezes Desarmado", "Bronn, Dylan", "Dylan Bronn", "0.5", 2.0),    // foi desarmado
      mk(236221, "Jogador - Chutes no Gol com o Pé Esquerdo", "Ali, Taha", "Ali, Taha Abdi", "0.5", 4.0), // subtipo SOT
      mk(238500, "Jogador - Impedimentos", "Ali, Taha", "Ali, Taha Abdi", "0.5", 3.0),                // impedimentos
      teamMk(547, "Mais de 7.5 chutes no gol na partida", 1.92),                                       // partida (sem jogador)
      // status != active → pula
      { ...mk(236220, "Jogador - Chutes no Gol", "Suspenso, X", "Suspenso X", "0.5", 1.7), status: "suspended" },
    ],
  }],
};

describe("parseSuperbet (Superbet) — de-para por marketId, linha em specifiers.total", () => {
  it("aceita só os 4 mercados de jogador certos com a linha e a odd certas", () => {
    const { linhas } = normalizeCollected(parseSuperbet(real, "superbet"), SUPERBET_TABLE);
    const k = (mt: string, l: number, ent: string) => linhas.find((x) => x.market_type === mt && x.linha === l && x.entidade === ent);
    expect(k("sot", 0.5, "Ali, Taha Abdi")).toMatchObject({ odd_over: 1.61, book: "superbet" });
    expect(k("sot", 1.5, "Ali, Taha Abdi")).toMatchObject({ odd_over: 3.8 });
    expect(k("sot", 2.5, "Ali, Taha Abdi")).toMatchObject({ odd_over: 9.6 });
    expect(k("finalizacoes", 1.5, "Dylan Bronn")).toMatchObject({ odd_over: 2.1 });
    expect(k("desarmes", 0.5, "Dylan Bronn")).toMatchObject({ odd_over: 1.45 });
    expect(k("faltas", 0.5, "Ali, Taha Abdi")).toMatchObject({ odd_over: 1.37 });
    expect(linhas).toHaveLength(6); // só esses 6
  });

  it("usa o nome cheio (extra.replaced-spec-player_name) como entidade; over-only", () => {
    const { linhas } = normalizeCollected(parseSuperbet(real, "superbet"), SUPERBET_TABLE);
    expect(linhas.every((x) => x.odd_under == null)).toBe(true); // escada, sem 'Menos de'
    expect(linhas.some((x) => x.entidade === "Ali, Taha Abdi")).toBe(true);
  });

  it("rejeita faltas sofridas, vezes desarmado, subtipo de pé, impedimentos; ignora partida e suspenso", () => {
    const { linhas, linhas_rejeitadas } = normalizeCollected(parseSuperbet(real, "superbet"), SUPERBET_TABLE);
    expect(linhas_rejeitadas.some((r) => /sofrid|recebid/i.test(r.motivo))).toBe(true); // faltas sofridas explícito
    expect(linhas.some((x) => x.entidade === "Suspenso X")).toBe(false);                 // status suspenso
    expect(linhas.every((x) => x.odd_over < 9.7)).toBe(true);                            // nada de partida/odds absurdas
    // o de-para mapeia só 4 marketIds; o resto (238450/236221/238500) cai como não mapeado
    expect(linhas.some((x) => x.market_type === "desarmes" && x.entidade === "Dylan Bronn" && x.linha === 0.5)).toBe(true);
  });
});

describe("parseSuperbetEventList (crosswalk) — matchName 'A·B' em PT", () => {
  it("split no '·' → {id, home, away} por jogo", () => {
    const data = { data: [
      { eventId: 12512182, matchName: "Suécia·Tunísia", tournamentId: 1434 },
      { eventId: 11499913, matchName: "Espanha·Cabo Verde", tournamentId: 1432 },
    ] };
    const evs = parseSuperbetEventList(data);
    expect(evs).toHaveLength(2);
    expect(evs.find((e) => e.id === "12512182")).toMatchObject({ home: "Suécia", away: "Tunísia" });
    expect(evs.find((e) => e.id === "11499913")).toMatchObject({ home: "Espanha", away: "Cabo Verde" });
  });
});
