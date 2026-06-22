// PURO: a escalação confirmou AGORA? (era != confirmed e virou confirmed). Esse é o
// instante do salto da linha — onde 1 coleta captura o CLV mais valioso. O runner usa
// isto pra disparar UMA coleta no momento da virada e parar de vigiar.
export function detectFlip(prev: string | null | undefined, curr: string): boolean {
  return curr === "confirmed" && prev !== "confirmed";
}
