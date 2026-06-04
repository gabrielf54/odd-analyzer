import { describe, it, expect } from "vitest";
import { validateIaOutput } from "../src/ai/schema.js";

const cands = [{ jogador: "Kaiki", linha: 1.5 }];

describe("validateIaOutput", () => {
  it("aceita estrutura válida com aposta dentro dos candidatos", () => {
    const obj = {
      melhor_aposta: { jogador: "Kaiki", linha: 1.5, veredito: "APOSTAR", confianca: "alta", motivo: "edge bom" },
      outras: [], alertas: [],
    };
    expect(validateIaOutput(obj, cands)).toBe(true);
  });

  it("aceita melhor_aposta null", () => {
    expect(validateIaOutput({ melhor_aposta: null, outras: [], alertas: [] }, cands)).toBe(true);
  });

  it("rejeita aposta inventada (jogador fora dos candidatos)", () => {
    const obj = {
      melhor_aposta: { jogador: "Fantasma", linha: 1.5, veredito: "APOSTAR", confianca: "alta", motivo: "x" },
      outras: [], alertas: [],
    };
    expect(validateIaOutput(obj, cands)).toBe(false);
  });

  it("rejeita veredito inválido e estrutura faltando", () => {
    expect(validateIaOutput({ melhor_aposta: { jogador: "Kaiki", linha: 1.5, veredito: "TALVEZ", confianca: "alta", motivo: "x" }, outras: [], alertas: [] }, cands)).toBe(false);
    expect(validateIaOutput({ outras: [], alertas: [] }, cands)).toBe(false);
  });
});
