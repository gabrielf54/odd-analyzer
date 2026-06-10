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

export const TILT_MIN = 0.85;
export const TILT_MAX = 1.20;

/** Tilt posicional: o adversário concede desproporcionalmente a esta posição?
 * share_adv/share_base clampado. Neutro (1.0) se faltar dado — fail-closed. */
export function positionalTilt(shareAdv: number | null, shareBase: number | null): number {
  if (shareAdv == null || shareBase == null || shareBase <= 0) return 1.0;
  return Math.max(TILT_MIN, Math.min(TILT_MAX, shareAdv / shareBase));
}
