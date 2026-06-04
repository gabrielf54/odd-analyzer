import { chat as defaultChat, type Msg } from "./openrouter.js";
import { validateIaOutput } from "./schema.js";

export const PROMPT_SISTEMA =
  "Você é um analista de apostas conservador. Recebe um JSON com candidatos já " +
  "calculados em código (prob_modelo, prob_devig, edge, ev, etc.). REGRAS: " +
  "use SOMENTE os números fornecidos; NUNCA invente número, estatística ou lesão; " +
  "só marque veredito 'APOSTAR' quando edge>0 E ev for claramente positivo E " +
  "xi_confirmado=true E amostra_jogos suficiente; compare e escolha a MELHOR aposta; " +
  "na dúvida, não recomende (melhor_aposta=null); explique em 1-2 frases ancoradas " +
  "SÓ nos campos recebidos. Responda APENAS JSON no formato: " +
  '{"melhor_aposta": {"jogador","linha","veredito","confianca","motivo"} ou null, ' +
  '"outras": [], "alertas": []}. veredito ∈ {APOSTAR,NAO_APOSTAR,PASSAR}; ' +
  "confianca ∈ {alta,media,baixa}.";

function parse(texto: string): any {
  try { return JSON.parse(texto); } catch { return null; }
}

export type ChatFn = (messages: Msg[], opts?: { temperature?: number }) => Promise<string>;

/** Lê o dossiê pronto e recomenda a melhor aposta. 1 tentativa + 1 retry; inválido → fail-closed. */
export async function analisar(
  candidatos: any[],
  contexto: any,
  chatFn: ChatFn = defaultChat,
): Promise<any> {
  const user = JSON.stringify({ contexto, candidatos });
  const messages: Msg[] = [
    { role: "system", content: PROMPT_SISTEMA },
    { role: "user", content: user },
  ];
  for (let i = 0; i < 2; i++) {
    let raw: string;
    try { raw = await chatFn(messages, { temperature: 0.0 }); } catch { continue; }
    const obj = parse(raw);
    if (obj != null && validateIaOutput(obj, candidatos)) return obj;
  }
  return { melhor_aposta: null, outras: [], alertas: ["IA não produziu saída válida (fail-closed)."] };
}

/** IA desligada (offline/sem custo): não opina, deixa os candidatos passarem. */
export function fakeAnalista(_candidatos: any[], _contexto: any): any {
  return {
    melhor_aposta: null,
    outras: [],
    alertas: ["IA desligada — exibindo apenas candidatos do modelo (edge/EV em código)."],
  };
}
