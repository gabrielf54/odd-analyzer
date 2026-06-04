/** Probabilidade implícita de uma odd decimal. Odd deve ser > 1. */
export function impliedProb(odd: number): number {
  if (odd <= 1.0) throw new Error(`odd decimal deve ser > 1.0, recebido ${odd}`);
  return 1.0 / odd;
}

/** Normalização proporcional: p_i = implícita_i / soma. */
export function devigMultiplicative(oddOver: number, oddUnder: number): [number, number] {
  const io = impliedProb(oddOver), iu = impliedProb(oddUnder);
  const s = io + iu;
  return [io / s, iu / s];
}

/** Acha k tal que io^k + iu^k = 1 (bisseção); p_i = implícita_i^k. */
export function devigPower(oddOver: number, oddUnder: number): [number, number] {
  const io = impliedProb(oddOver), iu = impliedProb(oddUnder);
  let lo = 0.1, hi = 20.0, k = (lo + hi) / 2;
  for (let i = 0; i < 100; i++) {
    k = (lo + hi) / 2;
    const f = io ** k + iu ** k - 1.0;
    if (Math.abs(f) < 1e-12) break;
    if (f > 0) lo = k; // f decresce com k (io,iu<1) -> f>0 ⇒ k sobe
    else hi = k;
  }
  return [io ** k, iu ** k];
}

/** Prob justa do OVER, conservadora: a MAIOR entre os dois métodos. */
export function fairProbOver(oddOver: number, oddUnder: number): number {
  const [poM] = devigMultiplicative(oddOver, oddUnder);
  const [poP] = devigPower(oddOver, oddUnder);
  return Math.max(poM, poP);
}
