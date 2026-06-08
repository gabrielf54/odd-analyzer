import { describe, it, expect } from "vitest";
import { analyze, fakeAnalyst } from "../src/ai/analyst.js";

const cands = [{ jogador: "Kaiki", linha: 1.5 }];

describe("analyze", () => {
  it("retorna o obj quando o chat devolve JSON válido", async () => {
    const valido = JSON.stringify({
      melhor_aposta: { jogador: "Kaiki", linha: 1.5, veredito: "APOSTAR", confianca: "alta", motivo: "edge" },
      outras: [], alertas: [],
    });
    const out = await analyze(cands, { jogo: "x" }, async () => valido);
    expect(out.melhor_aposta.jogador).toBe("Kaiki");
  });

  it("fail-closed quando o chat devolve JSON inválido 2x", async () => {
    const out = await analyze(cands, { jogo: "x" }, async () => "não é json");
    expect(out.melhor_aposta).toBeNull();
    expect(out.alertas[0]).toMatch(/fail-closed/);
  });

  it("fail-closed quando o chat lança (erro de transporte)", async () => {
    const out = await analyze(cands, { jogo: "x" }, async () => { throw new Error("rede"); });
    expect(out.melhor_aposta).toBeNull();
  });
});

describe("fakeAnalyst", () => {
  it("devolve alerta de IA desligada", () => {
    const out = fakeAnalyst(cands, {});
    expect(out.melhor_aposta).toBeNull();
    expect(out.alertas[0]).toMatch(/desligada/);
  });
});
