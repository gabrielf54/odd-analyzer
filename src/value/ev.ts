/** edge = prob_modelo - prob_devig; ev = prob_modelo * odd - 1. */
export function edgeEv(probModelo: number, probDevig: number, oddDecimal: number): { edge: number; ev: number } {
  return {
    edge: probModelo - probDevig,
    ev: probModelo * oddDecimal - 1.0,
  };
}
