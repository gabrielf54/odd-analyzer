// Valida a saída da IA sem lib externa. Garante estrutura E que a IA não inventou
// jogador/linha fora dos candidatos recebidos (anti-alucinação).
const VEREDITOS = new Set(["APOSTAR", "NAO_APOSTAR", "PASSAR"]);
const CONFIANCAS = new Set(["alta", "media", "baixa"]);

function apostaValida(ap: any, chavesValidas: Set<string>): boolean {
  const obrig = ["jogador", "linha", "veredito", "confianca", "motivo"];
  if (ap == null || typeof ap !== "object") return false;
  if (!obrig.every((k) => k in ap)) return false;
  if (!VEREDITOS.has(ap.veredito) || !CONFIANCAS.has(ap.confianca)) return false;
  return chavesValidas.has(`${ap.jogador}|${ap.linha}`);
}

export function validateIaOutput(obj: any, candidatos: any[]): boolean {
  if (obj == null || typeof obj !== "object") return false;
  if (!["melhor_aposta", "outras", "alertas"].every((k) => k in obj)) return false;
  if (!Array.isArray(obj.outras) || !Array.isArray(obj.alertas)) return false;
  const chaves = new Set(candidatos.map((c) => `${c.jogador}|${c.linha}`));
  if (obj.melhor_aposta != null && !apostaValida(obj.melhor_aposta, chaves)) return false;
  return obj.outras.every((o: any) => apostaValida(o, chaves));
}
