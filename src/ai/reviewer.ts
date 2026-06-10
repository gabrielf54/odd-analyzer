import { chat as defaultChat, type Msg } from "./openrouter.js";
import { validateReview } from "./reviewSchema.js";

export const PROMPT_REVISOR =
  "Você é um revisor de apostas conservador e cético. Recebe um JSON com candidatos " +
  "JÁ calculados e ordenados em código (prob_modelo, prob_devig, edge, ev, risco, " +
  "recomendado, amostra_jogos, incerteza, xi_confirmado). REGRAS: use SOMENTE os " +
  "números recebidos; NUNCA invente número, estatística ou lesão; dê um 'stance' para " +
  "CADA candidato recebido; use 'veta' quando houver motivo concreto pra não apostar " +
  "mesmo com edge>0 (ex.: amostra fraca, incerteza alta, linha muito esticada), " +
  "'ressalva' para cautela, 'concorda' quando estiver ok; explique a candidata " +
  "recomendada (recomendado=true) em 1-2 frases ancoradas SÓ nos campos recebidos. " +
  "Responda APENAS JSON: {\"topo_explicacao\": string|null, \"revisoes\": " +
  "[{\"jogador\",\"linha\",\"market_type\",\"stance\",\"nota\"}], \"alertas\": []}. " +
  "stance ∈ {concorda,ressalva,veta}; nota é string curta ou null.";

export type ChatFn = (messages: Msg[], opts?: { temperature?: number }) => Promise<string>;

export interface Revisao { stance: "concorda" | "ressalva" | "veta"; nota: string | null; }
export interface ReviewResult {
  candidatos: Record<string, unknown>[];
  ia: { topo_explicacao: string | null; alertas: string[] };
}

export type ReviewerFn = (candidatos: any[], contexto: any) => ReviewResult | Promise<ReviewResult>;

function parse(texto: string): any {
  try { return JSON.parse(texto); } catch { return null; }
}

/** Revisa os candidatos ranqueados numa única chamada: anexa `ia_revisao` a cada um
 * (merge por jogador|linha|market_type) e devolve a explicação do topo. 1 tentativa
 * + 1 retry; qualquer falha (saída inválida, erro de rede, sem chave) degrada de
 * forma graciosa: não veta nem aprova falso — ia_revisao=null em todos + alerta. */
export async function reviewCandidates(
  candidatos: Record<string, unknown>[],
  contexto: any,
  chatFn: ChatFn = defaultChat,
): Promise<ReviewResult> {
  if (candidatos.length === 0) {
    return { candidatos: [], ia: { topo_explicacao: null, alertas: [] } };
  }
  const messages: Msg[] = [
    { role: "system", content: PROMPT_REVISOR },
    { role: "user", content: JSON.stringify({ contexto, candidatos }) },
  ];
  for (let i = 0; i < 2; i++) {
    let raw: string;
    try { raw = await chatFn(messages, { temperature: 0.0 }); } catch { continue; }
    const obj = parse(raw);
    if (obj != null && validateReview(obj, candidatos)) {
      const byKey = new Map<string, Revisao>();
      for (const r of obj.revisoes) {
        byKey.set(`${r.jogador}|${r.linha}|${r.market_type}`, { stance: r.stance, nota: r.nota ?? null });
      }
      const merged = candidatos.map((c) => ({
        ...c,
        ia_revisao: byKey.get(`${c["jogador"]}|${c["linha"]}|${c["market_type"]}`) ?? null,
      }));
      return { candidatos: merged, ia: { topo_explicacao: obj.topo_explicacao ?? null, alertas: obj.alertas ?? [] } };
    }
  }
  return {
    candidatos: candidatos.map((c) => ({ ...c, ia_revisao: null })),
    ia: { topo_explicacao: null, alertas: ["IA indisponível — exibindo só o veredito do código"] },
  };
}
