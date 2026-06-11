import { chat as defaultChat, type Msg } from "./openrouter.js";
import { validateReview } from "./reviewSchema.js";
import { parseJsonLoose } from "./parseJson.js";

export const PROMPT_REVISOR =
  "Você é um analista de apostas cético que explica para uma pessoa LEIGA — entende de " +
  "futebol, mas NÃO entende de matemática nem de jargão de aposta. Recebe um JSON com " +
  "candidatos já calculados em código (prob_modelo, prob_devig, edge, ev, risco, " +
  "recomendado, amostra_jogos, incerteza, xi_confirmado, minutos_esperados, " +
  "concedido_adversario, posicao, titularidade, alerta_minutos, concedido_posicao, stats_detalhadas, forma_tendencia). " +
  // — julgamento —
  "JULGAMENTO: use SOMENTE os números recebidos; NUNCA invente número, estatística ou " +
  "lesão. Dê um 'stance' para CADA candidato: 'veta' se há motivo concreto pra não " +
  "apostar mesmo havendo vantagem (poucos jogos de amostra, jogador pode não começar ou " +
  "sair cedo, linha muito esticada); 'ressalva' para cautela; 'concorda' quando ok. " +
  // — ancoragem (anti-alucinação) —
  "ANCORAGEM (OBRIGATÓRIO): além de não inventar número, NÃO use conhecimento externo " +
  "sobre times/jogadores (fase, importância do jogo, estilo, clima, 'defende bem fora de casa'). " +
  "TODA afirmação deve ser derivável de um campo recebido: posição SOMENTE do campo 'posicao' " +
  "(G=goleiro, D=defensor, M=meio-campo, F=atacante — não invente função além disso); força/fraqueza " +
  "do adversário SOMENTE de 'concedido_adversario' e 'concedido_posicao'; tempo em campo de " +
  "'minutos_esperados'; status de escalação de 'titularidade' (confirmado|provavel|fora_do_xi) e " +
  "'alerta_minutos'. Quando titularidade != 'confirmado' ou alerta_minutos=true, o risco de banco/" +
  "substituição é o alerta PRIORITÁRIO. " +
  // — histórico (stats_detalhadas) —
  "HISTÓRICO (stats_detalhadas): media_5/media_10 = média por jogo nos últimos 5/10 " +
  "jogos; ultimos_valores = a contagem jogo a jogo (recente primeiro); media_casa/" +
  "media_fora = média jogando em casa/fora (jogos_casa/jogos_fora = quantos jogos); " +
  "minutos_medios = minutos por jogo. Você PODE citar essas médias pra justificar — " +
  "em linguagem comum ('vem fazendo uns 3 desarmes por jogo nos últimos 5', 'em casa " +
  "rende mais: 4 por jogo') — respeitando o limite de 1-2 números por texto. Médias " +
  "e histórico recente vêm SOMENTE de stats_detalhadas; campo null = não mencionar " +
  "(esses nomes de campo são só pra você localizar o dado — na saída, linguagem comum). " +
  "Ignore o campo 'trace' se presente — não cite nada dele. " +
  // — forma recente (I5: sinal de confronto como TEXTO, fora do número) —
  "FORMA (forma_tendencia): rótulo de como o jogador vem nos últimos jogos " +
  "('em alta'/'em queda'/'estável'), derivado das médias recentes — NÃO é número novo. " +
  "Você PODE citá-lo em linguagem comum ('vem numa fase boa', 'vinha caindo de produção') " +
  "para REFORÇAR um 'concorda' ou dar uma 'ressalva' — nunca como motivo único. " +
  "Campo null ou 'estável' = não precisa mencionar. Continua valendo a ancoragem: " +
  "não inventar número e não usar nada que não esteja num campo recebido. " +
  // — linguagem (o coração da mudança) —
  "LINGUAGEM (OBRIGATÓRIO): escreva em português do dia a dia, como se explicasse para um " +
  "amigo que NÃO aposta. É PROIBIDO usar NA SUA RESPOSTA estas palavras e qualquer jargão técnico: edge, " +
  "EV, valor esperado, pp, pontos percentuais, de-vig, devig, margem, prob, probabilidade, " +
  "shrinkage, encolhimento, multiplicador, fator, lambda, outlier, teto, cap, sem_devig, " +
  "amostra. NUNCA cite nomes de campos do JSON. " +
  "NÚMEROS: no máximo 1 ou 2 por texto, e SEMPRE traduzidos — transforme a prob_modelo em " +
  "'mais ou menos 1 em N jogos' (ex.: 26% ≈ 1 em 4; 54% ≈ 1 em 2); fale da odd como " +
  "'paga X vezes' ou 'odd X'. Nada de porcentagem crua. " +
  "Contagens do histórico (médias de stats_detalhadas) podem ir como número simples ('3 por jogo'). " +
  "Explique o PORQUÊ em palavras " +
  "(ex.: 'é volante, chuta pouco'; 'o adversário defende bem e aperta o espaço dele'; " +
  "'pode sair no meio do jogo'). " +
  // — formato —
  "FORMATO: topo_explicacao = 1-2 frases curtas e simples sobre a recomendada " +
  "(recomendado=true). nota = uma frase curta e simples (ou null se 'concorda' sem " +
  "ressalva). alertas = no máximo 3, cada um uma frase curta de risco PRÁTICO em " +
  "linguagem leiga (ex.: 'pode não começar jogando', 'o adversário defende muito bem'), " +
  "sem jargão. " +
  "Responda APENAS JSON (sem cercas de markdown): {\"topo_explicacao\": string|null, " +
  "\"revisoes\": [{\"jogador\",\"linha\",\"market_type\",\"stance\",\"nota\"}], " +
  "\"alertas\": []}. stance ∈ {concorda,ressalva,veta}; nota é string curta ou null.";

export type ChatFn = (messages: Msg[], opts?: { temperature?: number }) => Promise<string>;

export interface Revisao { stance: "concorda" | "ressalva" | "veta"; nota: string | null; }
export interface ReviewResult {
  candidatos: Record<string, unknown>[];
  ia: { topo_explicacao: string | null; alertas: string[] };
}

export type ReviewerFn = (candidatos: any[], contexto: any) => ReviewResult | Promise<ReviewResult>;

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
  let ultimoMotivo = "sem tentativa";
  for (let i = 0; i < 2; i++) {
    let raw: string;
    try { raw = await chatFn(messages, { temperature: 0.0 }); }
    catch (e) { ultimoMotivo = `chamada falhou: ${e instanceof Error ? e.message : String(e)}`; continue; }
    const obj = parseJsonLoose(raw);
    if (obj == null) { ultimoMotivo = "saída não é JSON"; continue; }
    if (!validateReview(obj, candidatos)) { ultimoMotivo = "JSON fora do schema esperado"; continue; }
    {
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
  console.warn(`[reviewer] IA degradou após 2 tentativas — motivo: ${ultimoMotivo}`);
  return {
    candidatos: candidatos.map((c) => ({ ...c, ia_revisao: null })),
    ia: { topo_explicacao: null, alertas: ["IA indisponível — exibindo só o veredito do código"] },
  };
}
