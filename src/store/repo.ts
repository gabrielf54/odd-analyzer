/** Closing Line Value: positivo = peguei preço melhor que o fechamento. */
export function clv(oddFlag: number, closingOdd: number): number {
  return oddFlag / closingOdd - 1.0;
}

export interface OddsRow {
  event_id: string;
  entidade: string;
  market_type: string;
  linha: number;
  odd_over: number;
  odd_under: number | null;
  book: string;
  coletado_em?: string;
}

export interface OddsEventSummary {
  event_id: string;
  total_linhas: number;
  ultimo_coletado_em: string | null;
}

export interface Repo {
  saveAnalysis(eventId: string, payload: any): Promise<void> | void;
  saveOdds(eventId: string, lines: OddsRow[]): Promise<void> | void;
  getOdds(eventId: string): Promise<OddsRow[]> | OddsRow[];
  deleteOdds(eventId: string, filter?: Partial<OddsRow>): Promise<void> | void;
  listOddsEvents(): Promise<OddsEventSummary[]> | OddsEventSummary[];
  getAnalysis(eventId: string): Promise<any | null> | (any | null);
  saveLedger(rows: any[]): Promise<void> | void;
  updateClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number, resultado: number): Promise<void> | void;
  saveCrosswalk(canonicalId: number, normalizedName: string, sourceIds: any, confidence: number, manuallyVerified?: boolean): Promise<void> | void;
  getCrosswalk(canonicalId: number): Promise<any | null> | (any | null);
  listCrosswalk(): Promise<Record<string, string>> | Record<string, string>;
  snapshotClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number): Promise<void> | void;
}

export class InMemoryRepo implements Repo {
  analyses = new Map<string, any>();
  ledger: any[] = [];
  crosswalk = new Map<number, any>();
  odds = new Map<string, OddsRow[]>();

  saveAnalysis(eventId: string, payload: any) { this.analyses.set(eventId, payload); }
  getAnalysis(eventId: string) { return this.analyses.get(eventId) ?? null; }
  saveLedger(rows: any[]) { this.ledger.push(...rows); }

  private oddsKey(r: OddsRow): string {
    return `${r.entidade}|${r.market_type}|${r.linha}|${r.book}`;
  }

  saveOdds(eventId: string, lines: OddsRow[]) {
    const cur = this.odds.get(eventId) ?? [];
    const byKey = new Map(cur.map((r) => [this.oddsKey(r), r]));
    for (const l of lines) byKey.set(this.oddsKey(l), { ...l, event_id: eventId });
    this.odds.set(eventId, [...byKey.values()]);
  }

  getOdds(eventId: string): OddsRow[] {
    return this.odds.get(eventId) ?? [];
  }

  deleteOdds(eventId: string, filter?: Partial<OddsRow>) {
    if (!filter || Object.keys(filter).length === 0) { this.odds.delete(eventId); return; }
    const cur = this.odds.get(eventId) ?? [];
    const entries = Object.entries(filter);
    this.odds.set(eventId, cur.filter((r) => !entries.every(([k, v]) => (r as any)[k] === v)));
  }

  listOddsEvents(): OddsEventSummary[] {
    const out: OddsEventSummary[] = [];
    for (const [event_id, rows] of this.odds) {
      const times = rows.map((r) => r.coletado_em ?? "").filter(Boolean).sort();
      out.push({ event_id, total_linhas: rows.length, ultimo_coletado_em: times.length ? times[times.length - 1]! : null });
    }
    return out;
  }

  updateClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number, resultado: number) {
    for (const row of this.ledger) {
      if (!(row.event_id === eventId && row.jogador === jogador && row.linha === linha)) continue;
      if (marketType != null && row.market_type !== marketType) continue;
      row.odd_fechamento = closingOdd;
      row.resultado = resultado;
      row.clv = clv(row.odd_flag, closingOdd);
      break;
    }
  }

  saveCrosswalk(canonicalId: number, normalizedName: string, sourceIds: any, confidence: number, manuallyVerified = false) {
    this.crosswalk.set(canonicalId, {
      id_canonico: canonicalId, nome_normalizado: normalizedName,
      fontes_ids: sourceIds, confianca: confidence, verificado_manual: manuallyVerified,
    });
  }
  getCrosswalk(canonicalId: number) { return this.crosswalk.get(canonicalId) ?? null; }

  listCrosswalk(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const row of this.crosswalk.values()) out[row.nome_normalizado] = String(row.id_canonico);
    return out;
  }

  snapshotClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number) {
    for (const row of this.ledger) {
      if (!(row.event_id === eventId && row.jogador === jogador && row.linha === linha)) continue;
      if (marketType != null && row.market_type !== marketType) continue;
      row.odd_fechamento = closingOdd;
      row.clv = clv(row.odd_flag, closingOdd);
      break;
    }
  }
}

/** Persiste no Supabase via @supabase/supabase-js. Tabelas em store/schema.sql. */
export class SupabaseRepo implements Repo {
  private client: any;
  constructor(client?: any) {
    if (client == null) {
      // import dinâmico evita carregar supabase-js nos testes que usam InMemoryRepo
      throw new Error("SupabaseRepo requer client (use createSupabaseRepo() p/ montar com env)");
    }
    this.client = client;
  }

  async saveAnalysis(eventId: string, payload: any) {
    await this.client.from("analises").upsert({ event_id: eventId, ...payload });
  }

  async saveOdds(eventId: string, lines: OddsRow[]) {
    if (!lines.length) return;
    const rows = lines.map((l) => ({ ...l, event_id: eventId }));
    await this.client.from("odds").upsert(rows, { onConflict: "event_id,entidade,market_type,linha,book" });
  }
  async getOdds(eventId: string): Promise<OddsRow[]> {
    const { data } = await this.client.from("odds").select("*").eq("event_id", eventId);
    return (data ?? []) as OddsRow[];
  }
  async deleteOdds(eventId: string, filter?: Partial<OddsRow>) {
    let q = this.client.from("odds").delete().eq("event_id", eventId);
    for (const [k, v] of Object.entries(filter ?? {})) q = q.eq(k, v);
    await q;
  }
  async listOddsEvents(): Promise<OddsEventSummary[]> {
    const { data } = await this.client.from("odds").select("event_id, coletado_em");
    const map = new Map<string, { total: number; last: string | null }>();
    for (const r of (data ?? []) as any[]) {
      const cur = map.get(r.event_id) ?? { total: 0, last: null };
      cur.total++;
      if (r.coletado_em && (!cur.last || r.coletado_em > cur.last)) cur.last = r.coletado_em;
      map.set(r.event_id, cur);
    }
    return [...map].map(([event_id, v]) => ({ event_id, total_linhas: v.total, ultimo_coletado_em: v.last }));
  }
  async getAnalysis(eventId: string) {
    const { data } = await this.client.from("analises").select("*").eq("event_id", eventId);
    return data && data.length ? data[0] : null;
  }
  async saveLedger(rows: any[]) {
    if (rows.length) await this.client.from("paper_ledger").insert(rows);
  }
  async updateClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number, resultado: number) {
    let q = this.client.from("paper_ledger").select("odd_flag").eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) q = q.eq("market_type", marketType);
    const { data } = await q;
    if (!data || !data.length) return;
    if (data.length > 1) throw new Error(`paper_ledger duplicado (${eventId}, ${jogador}, ${linha}, ${marketType})`);
    const c = clv(data[0].odd_flag, closingOdd);
    let upd = this.client.from("paper_ledger").update({ odd_fechamento: closingOdd, resultado, clv: c })
      .eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) upd = upd.eq("market_type", marketType);
    await upd;
  }
  async saveCrosswalk(canonicalId: number, normalizedName: string, sourceIds: any, confidence: number, manuallyVerified = false) {
    await this.client.from("jogadores_crosswalk").upsert({
      id_canonico: canonicalId, nome_normalizado: normalizedName,
      fontes_ids: sourceIds, confianca: confidence, verificado_manual: manuallyVerified,
    });
  }
  async getCrosswalk(canonicalId: number) {
    const { data } = await this.client.from("jogadores_crosswalk").select("*").eq("id_canonico", canonicalId);
    return data && data.length ? data[0] : null;
  }
  async listCrosswalk(): Promise<Record<string, string>> {
    const { data } = await this.client.from("jogadores_crosswalk").select("nome_normalizado,id_canonico");
    const out: Record<string, string> = {};
    for (const row of data ?? []) out[row.nome_normalizado] = String(row.id_canonico);
    return out;
  }
  async snapshotClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number) {
    let sel = this.client.from("paper_ledger").select("odd_flag").eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) sel = sel.eq("market_type", marketType);
    const { data } = await sel;
    if (!data || !data.length) return;
    const c = clv(data[0].odd_flag, closingOdd);
    let upd = this.client.from("paper_ledger").update({ odd_fechamento: closingOdd, clv: c })
      .eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) upd = upd.eq("market_type", marketType);
    await upd;
  }
}

/** Monta um SupabaseRepo lendo URL/key do ambiente. */
export async function createSupabaseRepo(): Promise<SupabaseRepo> {
  const { createClient } = await import("@supabase/supabase-js");
  const { getRequired } = await import("../config.js");
  const client = createClient(getRequired("SUPABASE_URL"), getRequired("SUPABASE_SERVICE_KEY"));
  return new SupabaseRepo(client);
}
