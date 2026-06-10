/** Parse tolerante de JSON vindo de LLM. Modelos frequentemente embrulham a saída
 * em cerca markdown (```json ... ```) ou cercam de prosa, mesmo quando instruídos a
 * responder "APENAS JSON". Tenta: (1) parse direto; (2) tira cerca markdown;
 * (3) extrai o primeiro bloco `{...}`. Retorna null se nada vira JSON válido. */
export function parseJsonLoose(texto: string): any {
  if (!texto) return null;
  const direto = tryParse(texto);
  if (direto !== undefined) return direto;

  const semCerca = texto.trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
  const decercado = tryParse(semCerca);
  if (decercado !== undefined) return decercado;

  const bloco = semCerca.match(/\{[\s\S]*\}/);
  if (bloco) {
    const extraido = tryParse(bloco[0]);
    if (extraido !== undefined) return extraido;
  }
  return null;
}

function tryParse(s: string): any {
  try { return JSON.parse(s); } catch { return undefined; }
}
