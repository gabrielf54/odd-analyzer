// Valida a saída da IA sem lib externa. Garante estrutura E que a IA não inventou
// jogador/linha fora dos candidatos recebidos (anti-alucinação).
const VERDICTS = new Set(["APOSTAR", "NAO_APOSTAR", "PASSAR"]);
const CONFIDENCES = new Set(["alta", "media", "baixa"]);

function validBet(ap: any, validKeys: Set<string>): boolean {
  const required = ["jogador", "linha", "veredito", "confianca", "motivo"];
  if (ap == null || typeof ap !== "object") return false;
  if (!required.every((k) => k in ap)) return false;
  if (!VERDICTS.has(ap.veredito) || !CONFIDENCES.has(ap.confianca)) return false;
  return validKeys.has(`${ap.jogador}|${ap.linha}`);
}

export function validateAiOutput(obj: any, candidates: any[]): boolean {
  if (obj == null || typeof obj !== "object") return false;
  if (!["melhor_aposta", "outras", "alertas"].every((k) => k in obj)) return false;
  if (!Array.isArray(obj.outras) || !Array.isArray(obj.alertas)) return false;
  const keys = new Set(candidates.map((c) => `${c.jogador}|${c.linha}`));
  if (obj.melhor_aposta != null && !validBet(obj.melhor_aposta, keys)) return false;
  return obj.outras.every((o: any) => validBet(o, keys));
}
