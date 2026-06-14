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
