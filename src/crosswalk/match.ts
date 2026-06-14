// Casamento de nome de jogador entre fontes. FAIL-CLOSED: sem match confiável acima
// do threshold, retorna null (nunca chuta jogador). Substitui o difflib do Python por
// coeficiente de Dice sobre bigramas (determinístico, sem dependência). Scores não são
// idênticos ao difflib — como é fail-closed, divergência = no máximo perder um jogador.

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g"); // marcas combinantes (acentos pós-NFKD)

export function normalize(name: string): string {
  const s = (name ?? "").normalize("NFKD").replace(DIACRITICS, "");
  return s.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Coeficiente de Dice sobre bigramas de caractere. 1.0 = idêntico. */
export function sim(a: string, b: string): number {
  if (a === b) return 1.0;
  const ba = bigrams(a), bb = bigrams(b);
  if (ba.length === 0 || bb.length === 0) return 0.0;
  const counts = new Map<string, number>();
  for (const g of ba) counts.set(g, (counts.get(g) ?? 0) + 1);
  let inter = 0;
  for (const g of bb) {
    const c = counts.get(g) ?? 0;
    if (c > 0) { inter++; counts.set(g, c - 1); }
  }
  return (2 * inter) / (ba.length + bb.length);
}

// Score de nome jogador-a-jogador entre fontes (lar canônico; usado pelo crosswalk de
// stats-id e pelo casamento de odds). As fontes abreviam ("K. Havertz", "J. Kimmich");
// média 50/50 do primeiro nome (tolerante a inicial) com o sobrenome (último token).
function nameTokens(n: string): string[] { return n.split(" ").filter(Boolean); }
function firstTok(n: string): string { const t = nameTokens(n); return t.length ? t[0]! : n; }
function lastTok(n: string): string { const t = nameTokens(n); return t.length ? t[t.length - 1]! : n; }
function firstNameSim(a: string, b: string): number {
  const sa = a.replace(/[^a-z0-9]/g, ""), sb = b.replace(/[^a-z0-9]/g, "");
  if (sa.length === 0 || sb.length === 0) return 0;
  if (sa.length <= 1 || sb.length <= 1) return sa[0] === sb[0] ? 1 : 0; // inicial: mesma 1ª letra
  return sim(sa, sb);
}
/** Score de nome (0..1): casa o abreviado "K. Havertz" ao "Kai Havertz" e desempata
 * sobrenomes iguais (Emiliano vs Lautaro Martínez) pelo primeiro nome. */
export function scoreName(a: string, b: string): number {
  const na = normalize(a), nb = normalize(b);
  const first = firstNameSim(firstTok(na), firstTok(nb));
  const last = sim(lastTok(na), lastTok(nb));
  return 0.5 * first + 0.5 * last;
}

export interface MatchResult { id: string; name: string; confianca: number; }

/** Casa `oddName` contra `elenco` ([{id,name}]). overrides por nome normalizado têm
 * prioridade. Retorna o melhor match ou null se < threshold (fail-closed). */
export function matchPlayer(
  oddName: string,
  squad: { id: string; name: string }[],
  overrides: Record<string, string> | null = null,
  threshold = 0.9,
): MatchResult | null {
  const n = normalize(oddName);
  if (overrides) {
    const normOv: Record<string, string> = {};
    for (const [k, v] of Object.entries(overrides)) normOv[normalize(k)] = v;
    if (n in normOv) {
      const oid = normOv[n]!;
      const name = squad.find((p) => p.id === oid)?.name ?? oddName;
      return { id: oid, name, confianca: 1.0 };
    }
  }
  let best: { id: string; name: string } | null = null;
  let score = 0.0;
  for (const p of squad) {
    const s = sim(n, normalize(p.name));
    if (s > score) { best = p; score = s; }
  }
  if (best === null || score < threshold) return null;
  return { id: best.id, name: best.name, confianca: Math.round(score * 1000) / 1000 };
}
