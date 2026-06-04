/** Média ponderada entre a taxa do jogador (peso = nº de jogos) e o prior
 * (peso = priorStrength). Com apps=0, retorna o prior. */
export function shrinkRate(rate: number, apps: number, priorRate: number, priorStrength: number): number {
  return (apps * rate + priorStrength * priorRate) / (apps + priorStrength);
}
