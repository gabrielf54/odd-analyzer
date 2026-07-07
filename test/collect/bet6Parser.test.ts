import { describe, it, expect } from "vitest";
import { parseBet6, parseBet6EventList } from "../../src/collect/adapters/bet6.js";
import { normalizeCollected } from "../../src/collect/normalizer.js";
import { BETNACIONAL_TABLE } from "../../src/collect/tables.js";

// market_codes REAIS do evento ramp 914873610 (Holanda×Japão, 2026-06-14, deslogado). O
// code (EN) é a fonte autoritativa; pipes são inconsistentes (às vezes sem o da frente).
// outcome_name = jogador (player_name é null), odd string, "N ou mais" no nome.
const od = (market_code: string, outcome_name: string, odd: string, market_name = "", is_bet_builder = 0) =>
  ({ event_id: 914873610, outcome_name, player_name: null, market_code, market_name, odd, is_bet_builder });

const real = {
  odds: [
    // ACEITOS
    od("|Player To Have 1 Or More Shots On Target|", "Memphis Depay", "1.333"),
    od("Player To Have 2 Or More Shots On Target|", "Memphis Depay", "2.500"),   // pipe da frente ausente
    od("|Player To Have 2 Or More Shots|", "Memphis Depay", "1.111"),            // finalizações
    od("|Player To Commit 1 Or More Fouls|", "Memphis Depay", "1.400"),          // faltas cometidas
    // REJEITADOS (o bug que vazava como SOT/faltas):
    od("|Player To Win 1 Or More Fouls|", "Memphis Depay", "1.143"),                       // sofridas
    od("|Player To Have A Shot On Target In Each Half|", "Memphis Depay", "4.000"),         // "cada tempo"
    od("|Player To Have 1 Or More Shots On Target In 1st Half|", "Memphis Depay", "2.000"), // 1º tempo
    od("|Player To Have 1 Or More Foul Involvements|", "Memphis Depay", "1.025"),           // envolvimentos
    od("|Match Shots On Target|", "1 ou mais chutes no gol", "1.001"),                      // partida
    od("|Team To Have 11 Or More Shots On Target|", "Holanda", "31.000"),                   // time
    od("|Anytime Goalscorer|", "Memphis Depay", "2.00"),                                    // gol
    // bet builder → pula
    od("|Player To Have 1 Or More Shots On Target|", "Cody Gakpo", "1.50", "", 1),
  ],
};

describe("parseBet6 (Betnacional) — classificação por market_code ancorado", () => {
  it("aceita só os 3 mercados de jogador certos; SOT/finalizações/faltas com a linha 'N+'", () => {
    const { linhas } = normalizeCollected(parseBet6(real, "betnacional"), BETNACIONAL_TABLE);
    const k = (mt: string, l: number) => linhas.find((x) => x.market_type === mt && x.linha === l && x.entidade === "Memphis Depay");
    expect(k("sot", 0.5)).toMatchObject({ odd_over: 1.333 });
    expect(k("sot", 1.5)).toMatchObject({ odd_over: 2.5 }); // "2 Or More" = over 1.5
    expect(k("finalizacoes", 1.5)).toMatchObject({ odd_over: 1.111 });
    expect(k("faltas", 0.5)).toMatchObject({ odd_over: 1.4 });
    expect(linhas).toHaveLength(4); // só esses 4 — nada de "cada tempo"/1ºT/envolvimentos/time/gol
  });

  it("NÃO duplica SOT 0.5: 'In Each Half' e '1st Half' não viram chute no gol over 0.5", () => {
    const { linhas } = normalizeCollected(parseBet6(real, "betnacional"), BETNACIONAL_TABLE);
    const sot05 = linhas.filter((x) => x.market_type === "sot" && x.linha === 0.5 && x.entidade === "Memphis Depay");
    expect(sot05).toHaveLength(1);
    expect(sot05[0]!.odd_over).toBe(1.333); // a real, não a 4.0 do "cada tempo"
  });

  it("rejeita sofridas (To Win), envolvimentos, tempo, time e gol; pula bet builder", () => {
    const { linhas, linhas_rejeitadas } = normalizeCollected(parseBet6(real, "betnacional"), BETNACIONAL_TABLE);
    expect(linhas.some((x) => x.entidade === "Cody Gakpo")).toBe(false); // bet builder
    expect(linhas_rejeitadas.some((r) => /sofrid|recebid|fouls won/i.test(r.motivo))).toBe(true);
    // nada de odds absurdas de time/cada-tempo entrando:
    expect(linhas.every((x) => x.odd_over < 20)).toBe(true);
  });
});

// Mercados de PARTIDA — shape REAL capturado 2026-07-06 (USA×Belgium, ramp 916044119;
// recon do módulo de arbitragem). O payload de odds traz `events[0].home/away` → o 1X2
// mapeia casa/fora por NOME EXATO (não por ordem). "Total" = gols 90min; prorrogação
// tem códigos próprios (TOTAL_EXTRA_TIME) que ficam FORA. Escanteios têm a linha no
// próprio market_code ("Total Corners 9.5").
const matchReal = {
  events: [{ event_id: 916044119, home: "Estados Unidos", away: "Bélgica" }],
  odds: [
    od("Total", "Mais de 1,5 gols", "1.222", "Total"),
    od("Total", "Menos de 1,5 gols", "4.000", "Total"),
    od("|TOTAL_EXTRA_TIME|", "Mais de 1,5 gols", "3.000", "Gols Prorrogação"),   // prorrogação → fora
    od("|Total Corners 9.5|", "Mais de 9,5 Escanteios", "1.727", "Total de 9,5 Escanteios"),
    od("|Total Corners 9.5|", "Menos de 9,5 Escanteios", "2.000", "Total de 9,5 Escanteios"),
    od("|Win-Draw-Win|", "Estados Unidos", "2.600", "Resultado da partida"),
    od("|Win-Draw-Win|", "Empate", "3.200", "Resultado da partida"),
    od("|Win-Draw-Win|", "Bélgica", "2.900", "Resultado da partida"),
    od("|Full Time Result - 2 UP|", "Estados Unidos", "2.500", "Resultado Final - Pag. antecipado 2+"), // promo → fora
  ],
};

describe("parseBet6 — mercados de partida (captura 2026-07-06)", () => {
  it("pareia Mais/Menos do Total (gols) numa raw over/under de entidade partida", () => {
    const raws = parseBet6(matchReal, "betnacional");
    const gols = raws.find((r) => r.market_label === "match total goals")!;
    expect(gols).toMatchObject({ entidade: "partida", linha_raw: 1.5, odd_over: 1.222, odd_under: 4.0, subtype: "over_under" });
  });

  it("Win-Draw-Win vira 1x2 com casa/fora mapeados pelo NOME do events[0]", () => {
    const raws = parseBet6(matchReal, "betnacional");
    const x = raws.find((r) => r.subtype === "1x2")!;
    expect(x.market_label).toBe("match 1x2");
    expect(x.odd_over).toBe(2.6);   // Estados Unidos = home
    expect(x.odd_draw).toBe(3.2);
    expect(x.odd_under).toBe(2.9);  // Bélgica = away
  });

  it("cadeia com BETNACIONAL_TABLE: gols/escanteios/vitória entram; prorrogação e 2UP ficam fora", () => {
    const { linhas } = normalizeCollected(parseBet6(matchReal, "betnacional"), BETNACIONAL_TABLE);
    const byMkt = Object.fromEntries(linhas.map((l) => [l.market_type, l]));
    expect(byMkt["gols"]).toMatchObject({ linha: 1.5, odd_over: 1.222, odd_under: 4.0 });
    expect(byMkt["escanteios"]).toMatchObject({ linha: 9.5, odd_over: 1.727, odd_under: 2.0 });
    expect(byMkt["vitoria"]).toMatchObject({ linha: 0, odd_over: 2.6, odd_draw: 3.2, odd_under: 2.9 });
    expect(linhas).toHaveLength(3);
  });
});

describe("parseBet6EventList (crosswalk)", () => {
  it("dedup por event_id: 1 linha por jogo, com home/away (PT)", () => {
    const data = { odds: [
      { event_id: 914873584, home: "Alemanha", away: "Curacao", market_code: "|Win-Draw-Win|", outcome_name: "Alemanha" },
      { event_id: 914873584, home: "Alemanha", away: "Curacao", market_code: "|Win-Draw-Win|", outcome_name: "Empate" },
      { event_id: 914873610, home: "Holanda", away: "Japão", market_code: "|Win-Draw-Win|", outcome_name: "Holanda" },
    ] };
    const evs = parseBet6EventList(data);
    expect(evs).toHaveLength(2);
    expect(evs.find((e) => e.id === "914873584")).toMatchObject({ home: "Alemanha", away: "Curacao" });
  });
});
