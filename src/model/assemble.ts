import { expectedLambda } from "./sotModel.js";
import { shrinkRate } from "./shrinkage.js";

type Game = Record<string, unknown>;
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v));

/** Taxa do statField nas últimas N partidas (janelas 3/5/10). `games` em ordem
 * CRESCENTE (recente no fim). minutesField=null → média por-jogo; str → per-90
 * ponderado por minutos. */
export function windowedRate(
  games: Game[],
  statField: string,
  windows: number[] = [3, 5, 10],
  mando: string | null = null,
  minutesField: string | null = null,
): Record<string, number | null> {
  let source = games;
  if (mando !== null) source = games.filter((g) => g["mando"] === mando);

  const result: Record<string, number | null> = {};
  for (const n of windows) {
    const window = source.length >= 1 ? source.slice(-n) : [];
    if (window.length === 0) {
      result[`w${n}`] = null;
    } else if (minutesField === null) {
      const vals = window.map((g) => num(g[statField]));
      result[`w${n}`] = vals.reduce((a, b) => a + b, 0) / vals.length;
    } else {
      const totStat = window.reduce((a, g) => a + num(g[statField]), 0);
      const totMin = window.reduce((a, g) => a + (num(g[minutesField]) || 0), 0);
      result[`w${n}`] = totMin > 0 ? (totStat / totMin) * 90.0 : null;
    }
  }
  return result;
}

/** mu = expectedLambda(ratePer90, minutos) * oppMult * haMult. ratePer90 já encolhido. */
export function assembleMu(ratePer90: number, minutosEsperados: number, oppMult: number, haMult: number): number {
  return expectedLambda(ratePer90, minutosEsperados) * oppMult * haMult;
}

/** Filtra histórico por escopo comparando team_id de cada jogo com o time alvo. */
export function filterGamesByScope(games: Game[], escopo: string, entityTeamId: unknown): Game[] {
  if (escopo === "todos") return games;
  const alvo = String(entityTeamId);
  if (escopo === "selecao") return games.filter((g) => String(g["team_id"]) === alvo);
  if (escopo === "clube") return games.filter((g) => String(g["team_id"]) !== alvo);
  return games;
}

/** Minutos esperados = janela recente de minutes_played (w5→w3→w10). null se sem jogos. */
export function expectedMinutes(games: Game[]): number | null {
  const rates = windowedRate(games, "minutes_played");
  const w5 = rates["w5"], w3 = rates["w3"], w10 = rates["w10"];
  return w5 !== null && w5 !== undefined ? w5 : w3 !== null && w3 !== undefined ? w3 : w10 ?? null;
}

export interface PlayerMu { mu: number; raw_rate: number; shrunk: number; n: number; }

/** Conta pura compartilhada por produção e backtest. `games` em ordem CRESCENTE. */
export function playerMuFromGames(
  games: Game[], statField: string, priorRate: number, priorStrength: number,
  oppMult: number, haMult: number, minutosEsperados = 90.0,
): PlayerMu | null {
  const rates = windowedRate(games, statField, [3, 5, 10], null, "minutes_played");
  const w5 = rates["w5"], w3 = rates["w3"], w10 = rates["w10"];
  const rawRate = w5 !== null && w5 !== undefined ? w5 : w3 !== null && w3 !== undefined ? w3 : w10 ?? null;
  if (rawRate === null) return null;
  const shrunk = shrinkRate(rawRate, games.length, priorRate, priorStrength);
  const mu = assembleMu(shrunk, minutosEsperados, oppMult, haMult);
  return { mu, raw_rate: rawRate, shrunk, n: games.length };
}
