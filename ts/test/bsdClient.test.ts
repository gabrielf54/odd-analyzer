import { describe, it, expect, beforeEach } from "vitest";
import { BSDClient } from "../src/bsd/client.js";
import { clearCache } from "../src/lib/cache.js";

beforeEach(() => clearCache());

describe("BSDClient", () => {
  it("monta a URL base e repassa params para o get injetado", async () => {
    const chamadas: { url: string; params?: Record<string, unknown> }[] = [];
    const get = async (url: string, params?: Record<string, unknown>) => {
      chamadas.push({ url, params });
      return { results: [{ id: 1 }] };
    };
    const client = new BSDClient("k", { get });

    const r = await client.events({ league_id: 9, status: "finished" });
    expect(r).toEqual({ results: [{ id: 1 }] });
    expect(chamadas[0]!.url).toBe("https://sports.bzzoiro.com/api/v2/events/");
    expect(chamadas[0]!.params).toEqual({ league_id: 9, status: "finished" });
  });

  it("getEvent chama /events/{id}/", async () => {
    let chamada = "";
    const get = async (url: string) => { chamada = url; return { id: "42" }; };
    const client = new BSDClient("k", { get });
    const r = await client.getEvent("42");
    expect(r).toEqual({ id: "42" });
    expect(chamada).toBe("https://sports.bzzoiro.com/api/v2/events/42/");
  });

  it("api_key vazia lança", () => {
    expect(() => new BSDClient("")).toThrow();
  });
});
