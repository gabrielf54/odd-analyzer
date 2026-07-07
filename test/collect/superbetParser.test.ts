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

// Mercados de PARTIDA — shape REAL capturado 2026-07-06 (USA×Belgium, eventId 13865395;
// recon do módulo de arbitragem). Totais: name "Mais/Menos de X.5" + specifiers.total;
// 1X2: marketId 547 "Resultado Final" com name "1"/"X"/"2". Asiático (529, total inteiro/
// .25) e halves ficam fora do de-para.
const matchOd = (marketId: number, marketName: string, name: string, price: number, total?: string) => ({
  marketId, marketName, price, status: "active", name,
  specifiers: total != null ? { total } : null, extra: {},
});
const matchReal = {
  data: [{
    eventId: 13865395, matchName: "EUA·Bélgica",
    odds: [
      matchOd(200734, "Total de Gols", "Mais de 2.5", 1.8, "2.5"),
      matchOd(200734, "Total de Gols", "Menos de 2.5", 2.02, "2.5"),
      matchOd(704, "Total de Escanteios", "Mais de 9.5", 1.69, "9.5"),
      matchOd(704, "Total de Escanteios", "Menos de 9.5", 2.1, "9.5"),
      matchOd(547, "Resultado Final", "1", 2.57),
      matchOd(547, "Resultado Final", "X", 3.25),
      matchOd(547, "Resultado Final", "2", 2.9),
      matchOd(529, "Total de Gols Asiático", "Mais de 1", 1.35, "1"),          // asiático → fora
      matchOd(200735, "1º Tempo - Total de Gols", "Mais de 0.5", 1.4, "0.5"),  // 1º tempo → não mapeado
      matchOd(562, "1º Tempo - Resultado (1X2)", "EUA", 3.4),                   // 3-way de tempo, names não são 1/X/2
    ],
  }],
};

describe("parseSuperbet — mercados de partida (captura 2026-07-06)", () => {
  it("pareia Mais/Menos por (marketId, total) numa raw over/under de entidade partida", () => {
    const raws = parseSuperbet(matchReal, "superbet");
    const gols = raws.find((r) => r.market_label === "200734")!;
    expect(gols).toMatchObject({ entidade: "partida", linha_raw: 2.5, odd_over: 1.8, odd_under: 2.02, subtype: "over_under" });
  });

  it("Resultado Final (1/X/2) vira raw 1x2", () => {
    const raws = parseSuperbet(matchReal, "superbet");
    const x = raws.find((r) => r.subtype === "1x2")!;
    expect(x.market_label).toBe("547");
    expect(x).toMatchObject({ odd_over: 2.57, odd_draw: 3.25, odd_under: 2.9 });
  });

  it("cadeia com SUPERBET_TABLE: gols/escanteios/vitória; asiático e 1º tempo ficam fora", () => {
    const { linhas } = normalizeCollected(parseSuperbet(matchReal, "superbet"), SUPERBET_TABLE);
    const byMkt = Object.fromEntries(linhas.map((l) => [l.market_type, l]));
    expect(byMkt["gols"]).toMatchObject({ linha: 2.5, odd_over: 1.8, odd_under: 2.02 });
    expect(byMkt["escanteios"]).toMatchObject({ linha: 9.5, odd_over: 1.69, odd_under: 2.1 });
    expect(byMkt["vitoria"]).toMatchObject({ linha: 0, odd_over: 2.57, odd_draw: 3.25, odd_under: 2.9 });
    expect(linhas).toHaveLength(3);
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
