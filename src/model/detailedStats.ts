// igual a assemble.ts::Game — manter em sincronia
type Game = Record<string, unknown>;
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export interface StatsDetalhadas {
  media_5: number | null;
  media_10: number | null;
  readonly ultimos_valores: number[];
  minutos_medios: number | null;
  media_casa: number | null;
  media_fora: number | null;
  jogos_casa: number;
  jogos_fora: number;
}

/** Estatísticas DESCRITIVAS pro detalhe do jogador e pro JSON da IA revisora.
 * NÃO entra no money-path (prob/edge/EV seguem em assemble/sotModel).
 * `games` em ordem CRESCENTE (recente no fim). `homeMap`: event_id → home_team_id;
 * jogo ausente do mapa fica de fora do split casa/fora — nunca estimar mando. */
export function detailedStats(
  games: Game[], statField: string, homeMap: Map<string, string> = new Map(),
): StatsDetalhadas {
  const mean = (xs: number[]): number | null =>
    xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
  const last10 = games.slice(-10);
  const last5 = games.slice(-5);
  const vals = (gs: Game[]) => gs.map((g) => num(g[statField]));

  const casa: number[] = [];
  const fora: number[] = [];
  for (const g of last10) {
    const home = homeMap.get(String(g["event_id"]));
    if (home === undefined) continue;
    (home === String(g["team_id"]) ? casa : fora).push(num(g[statField]));
  }

  return {
    media_5: mean(vals(last5)),
    media_10: mean(vals(last10)),
    ultimos_valores: vals(last5).reverse(),
    minutos_medios: mean(last10.map((g) => num(g["minutes_played"]))), // janela 10 — minutos mudam devagar; mais largo = mais estável
    media_casa: mean(casa),
    media_fora: mean(fora),
    jogos_casa: casa.length,
    jogos_fora: fora.length,
  };
}

/** Rótulo DESCRITIVO de forma recente (I5): compara a média dos últimos 5 jogos com
 * a dos últimos 10. É TEXTO para a IA citar em linguagem leiga ("vem numa boa fase")
 * — NÃO entra no money-path (prob/edge/EV não mudam). null se não há sinal: dado
 * insuficiente (<3 jogos recentes) ou média base nula. Limiares ±15% pra evitar
 * rótulo de ruído. */
export function formaTendencia(sd: StatsDetalhadas | null): string | null {
  if (sd == null) return null;
  const { media_5, media_10 } = sd;
  if (media_5 == null || media_10 == null || media_10 <= 0) return null;
  if (sd.ultimos_valores.length < 3) return null; // amostra recente fraca → não rotula
  const ratio = media_5 / media_10;
  if (ratio >= 1.15) return "em alta";
  if (ratio <= 0.85) return "em queda";
  return "estável";
}
