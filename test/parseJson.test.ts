import { describe, it, expect } from "vitest";
import { parseJsonLoose } from "../src/ai/parseJson.js";

describe("parseJsonLoose", () => {
  it("faz parse de JSON puro", () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it("tira cerca ```json ... ``` (comportamento comum de LLM)", () => {
    const fenced = "```json\n{\"topo\": \"x\", \"n\": 2}\n```";
    expect(parseJsonLoose(fenced)).toEqual({ topo: "x", n: 2 });
  });

  it("tira cerca ``` simples (sem 'json')", () => {
    expect(parseJsonLoose("```\n{\"a\":1}\n```")).toEqual({ a: 1 });
  });

  it("extrai o objeto quando há prosa antes/depois", () => {
    const msg = "Claro, aqui está:\n{\"a\": 1, \"b\": [2,3]}\nEspero ter ajudado.";
    expect(parseJsonLoose(msg)).toEqual({ a: 1, b: [2, 3] });
  });

  it("retorna null quando não há JSON", () => {
    expect(parseJsonLoose("desculpe, não consigo")).toBeNull();
    expect(parseJsonLoose("")).toBeNull();
  });
});
