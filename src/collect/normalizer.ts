// OddsNormalizer — o CORAÇÃO da coleta automática. Mapeia o cru da casa para a linha
// canônica de src/model/markets.ts. FAIL-CLOSED: na dúvida, rejeita (o que não passa
// nunca entra no money-path). Função PURA, sem I/O. Ver docs/features/coleta-odds-automatica.

import type { ManualOddsLine, LinhaRejeitada } from "../manual/schema.js";

/** Linha CRUA coletada de uma casa (antes da normalização semântica). */
export interface RawCollectedLine {
  book: string;                  // slug da casa ("kto"/"betnacional"/...)
  market_label: string;          // rótulo CRU da casa (ex.: "Chutes a gol")
  entidade: string;              // nome do jogador, ou "partida"
  linha_raw: string | number;    // notação crua ("2+", "Mais de 1,5", point 2.5...)
  odd_over: number;
  odd_under?: number | null;
  subtype?: string;              // tipo estruturado do JSON ("over_under"/"exact"/"handicap"/...)
}

/** Mapeamento de UM rótulo de casa: vira um market_type canônico, OU é rejeitado com motivo. */
export type MarketMapping = { market_type: string } | { reject: string };
/** De-para de UMA casa: rótulo NORMALIZADO (lower/trim) → mapeamento. Nunca substring. */
export type HouseMarketTable = Record<string, MarketMapping>;

/** Linha canônica com o rótulo cru anexado (auditoria). Downstream (parseManualOdds/
 * store) ignora `rotulo_cru`. */
export type NormalizedLine = ManualOddsLine & { rotulo_cru: string };

export interface NormalizeResult {
  linhas: NormalizedLine[];
  linhas_rejeitadas: LinhaRejeitada[];
}

// Só mercado cumulativo over/under entra no nosso modelo de contagem. Exato/handicap/
// faixa/combinada são OUTRO animal → descartados (lidos do campo ESTRUTURADO, nunca do
// número do rótulo).
const SUBTIPOS_OK = new Set(["over_under", "over", "total", "n_mais", "n+", "cumulative", "yes_no"]);

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
function normLabel(s: string): string {
  return (s ?? "").normalize("NFKD").replace(DIACRITICS, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Normaliza um lote de linhas cruas de uma casa para linhas canônicas. FAIL-CLOSED:
 * tudo que não bate definição vai para linhas_rejeitadas com motivo. */
export function normalizeCollected(raws: RawCollectedLine[], table: HouseMarketTable): NormalizeResult {
  const linhas: NormalizedLine[] = [];
  const linhas_rejeitadas: LinhaRejeitada[] = [];
  const rej = (linha_crua: unknown, motivo: string) => linhas_rejeitadas.push({ linha_crua, motivo });

  for (const r of raws) {
    // 1. Subtipo: só over/under cumulativo. Lê o campo ESTRUTURADO, nunca o número do rótulo.
    if (r.subtype != null && !SUBTIPOS_OK.has(r.subtype.toLowerCase())) {
      rej(r, `subtipo fora da whitelist (over/under): ${r.subtype}`); continue;
    }
    // 2. De-para EXATA do rótulo (nunca substring). Não mapeado → fail-closed.
    const mapping = table[normLabel(r.market_label)];
    if (mapping == null) { rej(r, `rótulo não mapeado: ${r.market_label}`); continue; }
    if ("reject" in mapping) { rej(r, mapping.reject); continue; }
    // 3. Linha (notação → over canônico). Ambígua/ilegível → rejeita.
    const linha = parseLinha(r.linha_raw);
    if (linha == null) { rej(r, `linha ambígua ou ilegível: ${r.linha_raw}`); continue; }
    // 4. Odd válida.
    if (!(r.odd_over > 1.01)) { rej(r, `odd_over deve ser > 1.01: ${r.odd_over}`); continue; }
    if (r.odd_under != null && !(r.odd_under > 1.01)) { rej(r, `odd_under deve ser > 1.01: ${r.odd_under}`); continue; }

    linhas.push({
      market_type: mapping.market_type, entidade: r.entidade, linha,
      odd_over: r.odd_over, odd_under: r.odd_under ?? null, book: r.book,
      rotulo_cru: normLabel(r.market_label),
    });
  }
  return { linhas, linhas_rejeitadas };
}

/** É meio-inteiro (X.5)? */
function isHalf(n: number): boolean {
  return Math.abs(n - Math.floor(n) - 0.5) < 1e-9;
}

/** Notação de linha da casa → linha OVER canônica, ou null se ambígua/ilegível.
 * Regra (spec §5.1): `N+`=≥N=over(N−0.5); `X,5+`/`+X,5`/`Mais de X,5`/`Over X.5`=over X.5;
 * `+N`/`Mais de N` INTEIRO puro = ambíguo (≥N vs >N) → null. Inteiro puro estruturado
 * (point asiático/cheio) também → null (não é over no nosso modelo de contagem). */
export function parseLinha(raw: unknown): number | null {
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return null;
    return isHalf(raw) ? raw : null; // só .5 é over; inteiro cheio → ambíguo
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim().toLowerCase().replace(",", ".");
  if (s === "") return null;

  // Forma "N+" / "X.5+" (N ou mais)
  const mais = s.match(/^(\d+(?:\.\d+)?)\s*\+$/);
  if (mais) {
    const n = parseFloat(mais[1]!);
    if (!Number.isFinite(n)) return null;
    return isHalf(n) ? n : n - 0.5; // "2+"=≥2=over1.5 ; "1.5+"=≥1.5=over1.5
  }

  // Forma "+N" / "mais de N" / "over N" / "acima de N" / "more than N"
  const overMatch = s.match(/^(?:\+|mais de|over|acima de|more than)\s*(\d+(?:\.\d+)?)$/);
  if (overMatch) {
    const n = parseFloat(overMatch[1]!);
    if (!Number.isFinite(n)) return null;
    return isHalf(n) ? n : null; // ".5" = over direto; inteiro puro = AMBÍGUO → null
  }

  return null;
}
