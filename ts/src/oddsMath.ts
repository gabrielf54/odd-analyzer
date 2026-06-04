/** Converte odd americana ('-120','+150') para decimal. Decimal sem sinal ('1.83')
 * volta como float; inteiro sem ponto ('100') é tratado como americana. */
export function americanToDecimal(value: string | number): number {
  const s = String(value).trim();
  if (s.includes(".") && !s.startsWith("+") && !s.startsWith("-")) return parseFloat(s);
  const a = parseFloat(s);
  if (a > 0) return Math.round((1 + a / 100) * 1e4) / 1e4;
  return Math.round((1 + 100 / Math.abs(a)) * 1e4) / 1e4;
}
