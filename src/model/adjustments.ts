/** Ajuste pela defesa do adversário. >1 = defesa vazada; <1 = sólida.
 * Neutro (1.0) se a média da liga não for positiva. */
export function opponentMultiplier(oppConcededPerGame: number, leagueAvgConceded: number): number {
  if (leagueAvgConceded <= 0) return 1.0;
  return oppConcededPerGame / leagueAvgConceded;
}

/** Ajuste de mando. homeFactor/awayFactor normalizados em torno de 1. */
export function homeAwayMultiplier(isHome: boolean, homeFactor: number, awayFactor: number): number {
  return isHome ? homeFactor : awayFactor;
}
