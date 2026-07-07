import { describe, it, expect } from "vitest";
import {
  parseStake, parseStakeEventList, stakeEventOddsUrl, stakeTournamentUrl,
} from "../../src/collect/adapters/stake.js";
import { normalizeCollected } from "../../src/collect/normalizer.js";
import { STAKE_TABLE } from "../../src/collect/tables.js";

// Shape CRU REAL do Stake (motor PRÓPRIO, não Kambi). Captura deslogada/BR de 2026-06-15:
// Espanha×Cabo Verde (eventId 1025862165) e Bélgica×Egito (1025862146, pré-jogo p/
// desarmes/faltas com preço — ao vivo eles suspendem). /odds = {odds:[...], prePacks:[]};
// cada seleção: name=jogador, addValue=linha (string), oddValue=odd (number),
// oddTypeName="Mais"(Over)/"Menos"(Under), marketId=string (id de TIPO de mercado, global —
// confirmado igual nos 2 jogos), frozen=true → sem preço. Chave de de-para = marketId base
// (o /markets traz sufixo _NN de linha; o /odds traz a base). Liquidação Opta: desarmes
// "completados"=won_tackle, faltas "concedidas"=cometidas; "ganhas"=sofridas → rejeita.
const od = (
  marketId: string, name: string, addValue: string, oddValue: number,
  oddTypeName = "Mais", frozen = false,
) => ({
  id: `o-${marketId}-${name}-${addValue}-${oddTypeName}`, eventId: "1025862146",
  addValue, oddValue, rowId: 1, columnId: 1, canCashOut: true, name, marketId,
  oddValues: { decimal: oddValue.toFixed(3), american: "290", fractional: "29/10" },
  frozen, oddTypeName, betBuilderEnabled: false,
});

const realOdds = {
  odds: [
    // ACEITOS — os 4 mercados de jogador (marketId base, oddTypeName "Mais")
    od("1002035662", "Aymeric Laporte", "0.5", 3.9),            // sot
    od("1002035662", "Jovane Cabral", "0.5", 3.2),             // sot
    od("1004544421", "Pedri", "1.5", 2.4),                     // finalizacoes
    od("1001809658", 'Ahmed Sayed "Zizo"', "0.5", 1.3),        // desarmes (completados=won_tackle)
    od("1001809658", 'Ahmed Sayed "Zizo"', "1.5", 2.35),       // desarmes
    od("1007684754", "Youri Tielemans", "1.5", 2.15),          // faltas (concedidas=cometidas)
    // marketId com SUFIXO de linha (como vem no /markets) → casa pela BASE (sot)
    od("1002035662_55", "Marc Cucurella", "0.5", 4.0),
    // REJEITADOS / PULADOS
    od("1007684761", "Youri Tielemans", "0.5", 1.5),           // faltas SOFRIDAS (ganhas) → reject
    od("9999999999", "Foo Bar", "0.5", 2.0),                   // marketId não mapeado → fail-closed
    od("1002035662", "Frozen Guy", "0.5", 0, "Mais", true),    // frozen → sem preço → pula
    od("1002035662", "Under Guy", "0.5", 1.1, "Menos"),        // Under → pula (over-only)
  ],
  prePacks: [],
};

describe("parseStake (Stake) — de-para por marketId base, linha em addValue, over-only", () => {
  it("aceita só os 4 mercados de jogador certos com jogador/linha/odd certos", () => {
    const { linhas } = normalizeCollected(parseStake(realOdds, "stake"), STAKE_TABLE);
    const k = (mt: string, l: number, ent: string) =>
      linhas.find((x) => x.market_type === mt && x.linha === l && x.entidade === ent);
    expect(k("sot", 0.5, "Aymeric Laporte")).toMatchObject({ odd_over: 3.9, book: "stake" });
    expect(k("sot", 0.5, "Jovane Cabral")).toMatchObject({ odd_over: 3.2 });
    expect(k("finalizacoes", 1.5, "Pedri")).toMatchObject({ odd_over: 2.4 });
    expect(k("desarmes", 0.5, 'Ahmed Sayed "Zizo"')).toMatchObject({ odd_over: 1.3 });
    expect(k("desarmes", 1.5, 'Ahmed Sayed "Zizo"')).toMatchObject({ odd_over: 2.35 });
    expect(k("faltas", 1.5, "Youri Tielemans")).toMatchObject({ odd_over: 2.15 });
  });

  it("casa marketId com sufixo _NN pela base (1002035662_55 → sot)", () => {
    const { linhas } = normalizeCollected(parseStake(realOdds, "stake"), STAKE_TABLE);
    expect(linhas.find((x) => x.entidade === "Marc Cucurella")).toMatchObject({ market_type: "sot", linha: 0.5, odd_over: 4.0 });
  });

  it("over-only (odd_under null) e pula frozen e Under", () => {
    const { linhas } = normalizeCollected(parseStake(realOdds, "stake"), STAKE_TABLE);
    expect(linhas.every((x) => x.odd_under == null)).toBe(true);
    expect(linhas.some((x) => x.entidade === "Frozen Guy")).toBe(false); // frozen
    expect(linhas.some((x) => x.entidade === "Under Guy")).toBe(false);  // oddTypeName "Menos"
    expect(linhas).toHaveLength(7); // 6 alvos + 1 sufixado
  });

  it("rejeita faltas sofridas (1007684761) explícito e marketId não mapeado (fail-closed)", () => {
    const { linhas, linhas_rejeitadas } = normalizeCollected(parseStake(realOdds, "stake"), STAKE_TABLE);
    expect(linhas_rejeitadas.some((r) => /sofrid/i.test(r.motivo))).toBe(true);
    expect(linhas_rejeitadas.some((r) => /não mapeado/i.test(r.motivo))).toBe(true);
    expect(linhas.some((x) => x.entidade === "Foo Bar")).toBe(false);
    expect(linhas.every((x) => x.market_type !== "faltas" || x.entidade !== "Youri Tielemans" || x.linha !== 0.5)).toBe(true);
  });
});

// Mercados de PARTIDA — shape REAL capturado 2026-07-06 (USA×Belgium, eventId 1028225515;
// recon do módulo de arbitragem). Totais de partida: name="Mais"/"Menos", addValue=linha,
// oddTypeName=null. 1X2: oddTypeName "Home"/"Away" + empate com name "Empate" (oddTypeName
// null). Props de jogador com par Mais/Menos (oddTypeName) agora PAREIAM em over/under.
const matchOd = (marketId: string, name: string, addValue: string | null, oddValue: number, oddTypeName: string | null = null, frozen = false) => ({
  id: `m-${marketId}-${name}-${addValue}`, eventId: "1028225515",
  addValue, oddValue, rowId: 0, columnId: 0, canCashOut: true, name, marketId,
  oddValues: { decimal: String(oddValue) }, frozen, oddTypeName, betBuilderEnabled: true,
});
const matchReal = {
  odds: [
    matchOd("1001159926", "Mais", "2.5", 1.66),
    matchOd("1001159926", "Menos", "2.5", 1.98),
    matchOd("1001159897", "Mais", "9.5", 1.46),
    matchOd("1001159897", "Menos", "9.5", 2.04),
    matchOd("1001159858", "EUA", null, 2.6, "Home"),
    matchOd("1001159858", "Empate", null, 3.15),
    matchOd("1001159858", "Bélgica", null, 2.85, "Away"),
    // 3-way que NÃO queremos (resultado do 1º tempo, mesmo shape) → rejeitado no de-para
    matchOd("1002035664", "EUA", null, 3.0, "Home"),
    matchOd("1002035664", "Empate", null, 2.1),
    matchOd("1002035664", "Bélgica", null, 3.2, "Away"),
    // DNB (Home/Away sem empate) → não vira 1x2
    matchOd("1001159884", "EUA", null, 1.8, "Home"),
    matchOd("1001159884", "Bélgica", null, 1.95, "Away"),
    // prop de jogador com PAR Mais/Menos vivo → over/under pareado
    matchOd("1001809658", "Leandro Trossard", "0.5", 1.44, "Mais"),
    matchOd("1001809658", "Leandro Trossard", "0.5", 2.6, "Menos"),
    // par com o Menos frozen → só over
    matchOd("1001809658", "Kevin De Bruyne", "1.5", 3.0, "Mais"),
    matchOd("1001809658", "Kevin De Bruyne", "1.5", 0, "Menos", true),
  ],
  prePacks: [],
};

describe("parseStake — mercados de partida + pares de props (captura 2026-07-06)", () => {
  it("pareia Mais/Menos de partida por (marketId, addValue) com entidade partida", () => {
    const raws = parseStake(matchReal, "stake");
    const gols = raws.find((r) => r.market_label === "1001159926")!;
    expect(gols).toMatchObject({ entidade: "partida", linha_raw: 2.5, odd_over: 1.66, odd_under: 1.98, subtype: "over_under" });
  });

  it("Resultado Final (Home/Empate/Away) vira raw 1x2; DNB e outros 3-way não entram como vitoria", () => {
    const raws = parseStake(matchReal, "stake");
    const x2 = raws.filter((r) => r.subtype === "1x2");
    const rf = x2.find((r) => r.market_label === "1001159858")!;
    expect(rf).toMatchObject({ odd_over: 2.6, odd_draw: 3.15, odd_under: 2.85 });
    // DNB (sem empate) não emite 1x2
    expect(x2.some((r) => r.market_label === "1001159884")).toBe(false);
  });

  it("prop com par Mais/Menos vivo pareia; Menos frozen deixa só o over", () => {
    const raws = parseStake(matchReal, "stake");
    const trossard = raws.find((r) => r.entidade === "Leandro Trossard")!;
    expect(trossard.odd_over).toBe(1.44);
    expect(trossard.odd_under).toBe(2.6);
    const kdb = raws.find((r) => r.entidade === "Kevin De Bruyne")!;
    expect(kdb.odd_over).toBe(3.0);
    expect(kdb.odd_under ?? null).toBeNull();
  });

  it("cadeia com STAKE_TABLE: gols/escanteios/vitória entram; 1º tempo rejeitado", () => {
    const { linhas } = normalizeCollected(parseStake(matchReal, "stake"), STAKE_TABLE);
    const byMkt = Object.fromEntries(linhas.filter((l) => l.entidade === "partida").map((l) => [l.market_type, l]));
    expect(byMkt["gols"]).toMatchObject({ linha: 2.5, odd_over: 1.66, odd_under: 1.98 });
    expect(byMkt["escanteios"]).toMatchObject({ linha: 9.5, odd_over: 1.46, odd_under: 2.04 });
    expect(byMkt["vitoria"]).toMatchObject({ linha: 0, odd_over: 2.6, odd_draw: 3.15, odd_under: 2.85 });
    expect(linhas.filter((l) => l.entidade === "partida")).toHaveLength(3);
  });
});

describe("parseStakeEventList (crosswalk) — events[].teams.home/away em PT", () => {
  it("→ {id, home, away} por jogo", () => {
    const realList = {
      tournament: { id: "2010133908", name: "Copa do Mundo 2026" },
      events: [
        { id: "1025862165", dateStart: "2026-06-15T16:00:00.000Z", teams: { home: "Espanha", away: "Cabo Verde" }, externalIds: [{ provider: "BET_RADAR", value: "66456994" }] },
        { id: "1025862146", dateStart: "2026-06-15T19:00:00.000Z", teams: { home: "Bélgica", away: "Egito" } },
      ],
    };
    const evs = parseStakeEventList(realList);
    expect(evs).toHaveLength(2);
    expect(evs.find((e) => e.id === "1025862165")).toMatchObject({ home: "Espanha", away: "Cabo Verde" });
    expect(evs.find((e) => e.id === "1025862146")).toMatchObject({ home: "Bélgica", away: "Egito" });
  });
});

describe("URLs do Stake (endpoints capturados, públicos/deslogado)", () => {
  it("odds de um jogo", () => {
    expect(stakeEventOddsUrl("1025862165")).toBe("https://sbweb.stake.bet.br/api/v1/br/pt-br/events/1025862165/odds");
  });
  it("lista do torneio (default = Copa 2026)", () => {
    expect(stakeTournamentUrl()).toBe("https://sbweb.stake.bet.br/api/v1/br/pt-br/tournament/2010133908/live-upcoming");
    expect(stakeTournamentUrl("123")).toBe("https://sbweb.stake.bet.br/api/v1/br/pt-br/tournament/123/live-upcoming");
  });
});
