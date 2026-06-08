/** Closing Line Value: positivo = peguei preço melhor que o fechamento. */
export function clv(oddFlag: number, closingOdd: number): number {
  return oddFlag / closingOdd - 1.0;
}

export interface Repo {
  saveAnalysis(eventId: string, payload: any): Promise<void> | void;
  getAnalysis(eventId: string): Promise<any | null> | (any | null);
  saveLedger(rows: any[]): Promise<void> | void;
  updateClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number, resultado: number): Promise<void> | void;
  saveCrosswalk(canonicalId: number, normalizedName: string, sourceIds: any, confidence: number, manuallyVerified?: boolean): Promise<void> | void;
  getCrosswalk(canonicalId: number): Promise<any | null> | (any | null);
  snapshotClosing(eventId: string, jogador: string, linha: number, marketType: string | null, closingOdd: number): Promise<void> | void;
}

export class InMemoryRepo implements Repo {
  analyses = new Map<string, any>();
  ledger: any[] = [];
  crosswalk = new Map<number, any>();

  saveAnalysis(eventId: string, payload: any) { this.analyses.set(eventId, payload); }
  getAnalysis(eventId: string) { return this.analyses.get(eventId) ?? null; }
  saveLedger(rows: any[]) { this.ledger.push(...rows); }

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
