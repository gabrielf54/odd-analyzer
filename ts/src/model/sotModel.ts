import { lgamma, factorial } from "../lib/mathx.js";

/** Taxa esperada de SOT na partida = SoT/90 * minutos/90. */
export function expectedLambda(sotPer90: number, expectedMinutes: number): number {
  return (sotPer90 * expectedMinutes) / 90.0;
}

function poissonPmf(k: number, mu: number): number {
  return (Math.exp(-mu) * mu ** k) / factorial(k);
}

function nbinomPmf(k: number, r: number, mu: number): number {
  // NB2: média mu, dispersão r (>0). p = r/(r+mu).
  const p = r / (r + mu);
  const log =
    lgamma(k + r) - lgamma(r) - lgamma(k + 1) +
    r * Math.log(p) + k * Math.log(1 - p);
  return Math.exp(log);
}

/** P(X >= k). r=null -> Poisson; r>0 -> Binomial Negativa (overdispersion). */
export function probAtLeast(mu: number, k: number, r: number | null = null): number {
  if (k <= 0) return 1.0;
  if (mu <= 0) return 0.0; // média 0 => X sempre 0 (evita log(0))
  const pmf = r === null ? (i: number) => poissonPmf(i, mu) : (i: number) => nbinomPmf(i, r, mu);
  let cum = 0;
  for (let i = 0; i < k; i++) cum += pmf(i); // P(X <= k-1)
  return Math.max(0.0, 1.0 - cum);
}

/** P de bater uma linha over/under. Ex.: over 1.5 == P(X >= 2). */
export function probOverLine(mu: number, line: number, r: number | null = null): number {
  const k = Math.floor(line) + 1;
  return probAtLeast(mu, k, r);
}
