import { describe, it, expect } from "vitest";
import { validateReview } from "../src/ai/reviewSchema.js";
import { reviewCandidates, PROMPT_REVISOR } from "../src/ai/reviewer.js";

const cands = [
  { jogador: "Declan Rice", linha: 2.5, market_type: "desarmes", recomendado: true },
  { jogador: "Bukayo Saka", linha: 1.5, market_type: "desarmes", recomendado: false },
];

const validOut = {
  topo_explicacao: "Rice pega adversário que concede muitos desarmes; modelo 54%.",
  revisoes: [
    { jogador: "Declan Rice", linha: 2.5, market_type: "desarmes", stance: "concorda", nota: null },
    { jogador: "Bukayo Saka", linha: 1.5, market_type: "desarmes", stance: "veta", nota: "amostra fraca" },
  ],
  alertas: [],
};

describe("validateReview", () => {
  it("aceita saída bem-formada que só cita candidatos recebidos", () => {
    expect(validateReview(validOut, cands)).toBe(true);
  });
  it("rejeita stance inválido", () => {
    const bad = { ...validOut, revisoes: [{ ...validOut.revisoes[0], stance: "talvez" }] };
    expect(validateReview(bad, cands)).toBe(false);
  });
  it("rejeita revisão de candidato inexistente (anti-alucinação)", () => {
    const bad = { ...validOut, revisoes: [
      { jogador: "Fantasma", linha: 9.5, market_type: "desarmes", stance: "concorda", nota: null },
    ] };
    expect(validateReview(bad, cands)).toBe(false);
  });
  it("rejeita estrutura sem as chaves obrigatórias", () => {
    expect(validateReview({ revisoes: [], alertas: [] }, cands)).toBe(false);
  });
  it("rejeita nota que não seja string nem null", () => {
    const bad = { ...validOut, revisoes: [
      { jogador: "Declan Rice", linha: 2.5, market_type: "desarmes", stance: "concorda", nota: 42 },
    ] };
    expect(validateReview(bad, cands)).toBe(false);
  });
});

describe("PROMPT_REVISOR (userfriendly)", () => {
  it("manda escrever em linguagem leiga e proíbe o jargão técnico", () => {
    expect(PROMPT_REVISOR).toMatch(/leig|amigo que NÃO aposta|dia a dia/i);
    expect(PROMPT_REVISOR).toMatch(/PROIBIDO/);
    // cita os jargões a banir
    for (const termo of ["edge", "EV", "de-vig", "shrinkage"]) {
      expect(PROMPT_REVISOR, termo).toContain(termo);
    }
  });
  it("instrui traduzir número em '1 em N' e limitar a 1-2 números", () => {
    expect(PROMPT_REVISOR).toMatch(/1 em N|1 em \d/i);
    expect(PROMPT_REVISOR).toMatch(/máximo 1 ou 2|no máximo 1/i);
  });
  it("pede JSON sem cerca de markdown", () => {
    expect(PROMPT_REVISOR).toMatch(/sem cercas? de markdown/i);
  });
});

describe("PROMPT_REVISOR ancorado", () => {
  it("proíbe conhecimento externo e ancora posição no campo posicao", () => {
    expect(PROMPT_REVISOR).toMatch(/posicao/);
    expect(PROMPT_REVISOR).toMatch(/conhecimento externo/i);
    expect(PROMPT_REVISOR).toMatch(/titularidade/);
  });
});

describe("reviewCandidates", () => {
  it("mescla ia_revisao por chave (jogador|linha|market_type) e devolve topo_explicacao", async () => {
    const fakeChat = async () => JSON.stringify(validOut);
    const out = await reviewCandidates(cands, { jogo: "x" }, fakeChat);
    const rice = out.candidatos.find((c: any) => c.jogador === "Declan Rice")!;
    const saka = out.candidatos.find((c: any) => c.jogador === "Bukayo Saka")!;
    expect(rice.ia_revisao).toEqual({ stance: "concorda", nota: null });
    expect(saka.ia_revisao).toEqual({ stance: "veta", nota: "amostra fraca" });
    expect(out.ia.topo_explicacao).toContain("Rice");
  });

  it("saída inválida → degrada (ia_revisao null em todos, alerta)", async () => {
    const fakeChat = async () => "{ lixo nao-json";
    const out = await reviewCandidates(cands, { jogo: "x" }, fakeChat);
    expect(out.candidatos.every((c: any) => c.ia_revisao === null)).toBe(true);
    expect(out.ia.topo_explicacao).toBeNull();
    expect(out.ia.alertas[0]).toMatch(/indispon/i);
  });

  it("chat lança (sem chave/erro de rede) → degrada", async () => {
    const fakeChat = async () => { throw new Error("OPENROUTER_API_KEY ausente"); };
    const out = await reviewCandidates(cands, { jogo: "x" }, fakeChat);
    expect(out.candidatos.every((c: any) => c.ia_revisao === null)).toBe(true);
    expect(out.ia.alertas[0]).toMatch(/indispon/i);
  });

  it("lista vazia → vazia, sem chamar a IA", async () => {
    let chamou = false;
    const fakeChat = async () => { chamou = true; return "{}"; };
    const out = await reviewCandidates([], { jogo: "x" }, fakeChat);
    expect(out.candidatos).toEqual([]);
    expect(chamou).toBe(false);
  });
});
