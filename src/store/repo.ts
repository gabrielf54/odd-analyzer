/** Closing Line Value: positivo = peguei preço melhor que o fechamento. */
export function clv(oddFlag: number, oddFechamento: number): number {
  return oddFlag / oddFechamento - 1.0;
}

export interface Repo {
  saveAnalise(eventId: string, payload: any): Promise<void> | void;
  getAnalise(eventId: string): Promise<any | null> | (any | null);
  saveLedger(rows: any[]): Promise<void> | void;
  updateFechamento(eventId: string, jogador: string, linha: number, marketType: string | null, oddFechamento: number, resultado: number): Promise<void> | void;
  saveCrosswalk(idCanonico: number, nomeNormalizado: string, fontesIds: any, confianca: number, verificadoManual?: boolean): Promise<void> | void;
  getCrosswalk(idCanonico: number): Promise<any | null> | (any | null);
  snapshotFechamento(eventId: string, jogador: string, linha: number, marketType: string | null, oddFechamento: number): Promise<void> | void;
}

export class InMemoryRepo implements Repo {
  analises = new Map<string, any>();
  ledger: any[] = [];
  crosswalk = new Map<number, any>();

  saveAnalise(eventId: string, payload: any) { this.analises.set(eventId, payload); }
  getAnalise(eventId: string) { return this.analises.get(eventId) ?? null; }
  saveLedger(rows: any[]) { this.ledger.push(...rows); }

  updateFechamento(eventId: string, jogador: string, linha: number, marketType: string | null, oddFechamento: number, resultado: number) {
    for (const row of this.ledger) {
      if (!(row.event_id === eventId && row.jogador === jogador && row.linha === linha)) continue;
      if (marketType != null && row.market_type !== marketType) continue;
      row.odd_fechamento = oddFechamento;
      row.resultado = resultado;
      row.clv = clv(row.odd_flag, oddFechamento);
      break;
    }
  }

  saveCrosswalk(idCanonico: number, nomeNormalizado: string, fontesIds: any, confianca: number, verificadoManual = false) {
    this.crosswalk.set(idCanonico, {
      id_canonico: idCanonico, nome_normalizado: nomeNormalizado,
      fontes_ids: fontesIds, confianca, verificado_manual: verificadoManual,
    });
  }
  getCrosswalk(idCanonico: number) { return this.crosswalk.get(idCanonico) ?? null; }

  snapshotFechamento(eventId: string, jogador: string, linha: number, marketType: string | null, oddFechamento: number) {
    for (const row of this.ledger) {
      if (!(row.event_id === eventId && row.jogador === jogador && row.linha === linha)) continue;
      if (marketType != null && row.market_type !== marketType) continue;
      row.odd_fechamento = oddFechamento;
      row.clv = clv(row.odd_flag, oddFechamento);
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

  async saveAnalise(eventId: string, payload: any) {
    await this.client.from("analises").upsert({ event_id: eventId, ...payload });
  }
  async getAnalise(eventId: string) {
    const { data } = await this.client.from("analises").select("*").eq("event_id", eventId);
    return data && data.length ? data[0] : null;
  }
  async saveLedger(rows: any[]) {
    if (rows.length) await this.client.from("paper_ledger").insert(rows);
  }
  async updateFechamento(eventId: string, jogador: string, linha: number, marketType: string | null, oddFechamento: number, resultado: number) {
    let q = this.client.from("paper_ledger").select("odd_flag").eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) q = q.eq("market_type", marketType);
    const { data } = await q;
    if (!data || !data.length) return;
    if (data.length > 1) throw new Error(`paper_ledger duplicado (${eventId}, ${jogador}, ${linha}, ${marketType})`);
    const c = clv(data[0].odd_flag, oddFechamento);
    let upd = this.client.from("paper_ledger").update({ odd_fechamento: oddFechamento, resultado, clv: c })
      .eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) upd = upd.eq("market_type", marketType);
    await upd;
  }
  async saveCrosswalk(idCanonico: number, nomeNormalizado: string, fontesIds: any, confianca: number, verificadoManual = false) {
    await this.client.from("jogadores_crosswalk").upsert({
      id_canonico: idCanonico, nome_normalizado: nomeNormalizado,
      fontes_ids: fontesIds, confianca, verificado_manual: verificadoManual,
    });
  }
  async getCrosswalk(idCanonico: number) {
    const { data } = await this.client.from("jogadores_crosswalk").select("*").eq("id_canonico", idCanonico);
    return data && data.length ? data[0] : null;
  }
  async snapshotFechamento(eventId: string, jogador: string, linha: number, marketType: string | null, oddFechamento: number) {
    let sel = this.client.from("paper_ledger").select("odd_flag").eq("event_id", eventId).eq("jogador", jogador).eq("linha", linha);
    if (marketType != null) sel = sel.eq("market_type", marketType);
    const { data } = await sel;
    if (!data || !data.length) return;
    const c = clv(data[0].odd_flag, oddFechamento);
    let upd = this.client.from("paper_ledger").update({ odd_fechamento: oddFechamento, clv: c })
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
