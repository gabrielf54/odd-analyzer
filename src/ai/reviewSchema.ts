// Valida a saída da IA revisora sem lib externa. Garante estrutura E que a IA não
// inventou candidato fora dos recebidos (anti-alucinação), no estilo de ai/schema.ts.
const STANCES = new Set(["concorda", "ressalva", "veta"]);

function validReviewItem(r: any, validKeys: Set<string>): boolean {
  if (r == null || typeof r !== "object") return false;
  if (!["jogador", "linha", "market_type", "stance"].every((k) => k in r)) return false;
  if (!STANCES.has(r.stance)) return false;
  if (r.nota != null && typeof r.nota !== "string") return false;
  return validKeys.has(`${r.jogador}|${r.linha}|${r.market_type}`);
}

export function validateReview(obj: any, candidates: any[]): boolean {
  if (obj == null || typeof obj !== "object") return false;
  if (!["topo_explicacao", "revisoes", "alertas"].every((k) => k in obj)) return false;
  if (!Array.isArray(obj.revisoes) || !Array.isArray(obj.alertas)) return false;
  if (obj.topo_explicacao !== null && typeof obj.topo_explicacao !== "string") return false;
  const keys = new Set(candidates.map((c) => `${c.jogador}|${c.linha}|${c.market_type}`));
  return obj.revisoes.every((r: any) => validReviewItem(r, keys));
}
