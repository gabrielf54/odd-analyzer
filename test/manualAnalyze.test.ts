import { describe, it, expect } from "vitest";
import { analyzeManual } from "../src/manual/analyze.js";
import { InMemoryRepo } from "../src/store/repo.js";
import { fakeClient, fakeReviewer } from "./manualFixtures.js";

/** Versão do fakeClient sem escalação confirmada (lineup_status=pending, confirmed=false).
 * Mantém os jogadores na escalação (para squad() funcionar) mas marca como não confirmada,
 * fazendo xiTeamIds ficar vazio → titularidade = "provavel". */
function fakeClientNoXi(): any {
  const base = fakeClient();
  return {
    ...base,
    async lineups() {
      return {
        lineup_status: "pending",
        lineups: {
          home: { team_id: "100", confirmed: false, players: [{ id: "10", name: "Kai Havertz", position: "FW" }] },
          away: { team_id: "200", confirmed: false, players: [{ id: "20", name: "Joshua Kimmich", position: "MF" }] },
        },
      };
    },
  };
}

describe("analyzeManual", () => {
  it("roda mercado de jogador com odd por-jogador e marca sem_devig", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });

    const all = [...out.candidatos, ...out.reprovados];
    const havertz = all.find((c: any) => String(c.jogador).includes("Havertz"));
    expect(havertz).toBeDefined();
    expect(havertz!.sem_devig).toBe(true);
    expect(havertz!.odd).toBe(3.0);
    expect(out.jogadores_sem_match).toHaveLength(0);
  });

  it("propaga linhas_rejeitadas e jogadores_sem_match na resposta", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "Lionel Messi", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [{ linha_crua: { x: 1 }, motivo: "teste" }], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer });
    expect(out.jogadores_sem_match.length).toBe(1);
    expect(out.jogadores_sem_match[0]!.market_type).toBe("sot");
    expect(out.linhas_rejeitadas.length).toBe(1);
  });

  it("jogador descasado em várias linhas/mercados aparece UMA vez em jogadores_sem_match", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [
        { market_type: "sot", entidade: "Lionel Messi", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" },
        { market_type: "sot", entidade: "Lionel Messi", linha: 1.5, odd_over: 7.0, odd_under: null, book: "b" },
        { market_type: "finalizacoes", entidade: "Lionel Messi", linha: 0.5, odd_over: 2.0, odd_under: null, book: "b" },
        { market_type: "finalizacoes", entidade: "Lionel Messi", linha: 1.5, odd_over: 4.0, odd_under: null, book: "b" },
      ],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer });
    expect(out.jogadores_sem_match.length).toBe(1);
    expect(out.jogadores_sem_match[0]!.nome_casa).toBe("Lionel Messi");
  });

  it("persiste o resultado COMPLETO no repo e getManualResult o recupera", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [{ linha_crua: { x: 1 }, motivo: "teste" }], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer });

    const rec = repo.getManualResult("e1");
    expect(rec).not.toBeNull();
    expect(typeof rec!.analisado_em).toBe("string");
    // o resultado salvo é o MESMO que volta na resposta (candidatos, sem_match, linhas, ia)
    expect(rec!.result.candidatos).toEqual(out.candidatos);
    expect(rec!.result.jogadores_sem_match).toEqual(out.jogadores_sem_match);
    expect(rec!.result.linhas_rejeitadas).toEqual(out.linhas_rejeitadas);
    expect(rec!.result.ia).toEqual(out.ia);
    expect(repo.getManualResult("zzz")).toBeNull();
  });

  it("auto-casa jogador via override salvo no crosswalk", async () => {
    const repo = new InMemoryRepo();
    repo.saveCrosswalk(1000, "cr7", { casa: "CR7" }, 1.0, true);
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "CR7", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });
    expect(out.jogadores_sem_match).toHaveLength(0);
    const all = [...out.candidatos, ...out.reprovados];
    expect(all.find((c: any) => String(c.jogador).includes("Havertz"))).toBeDefined();
  });

  it("candidatos aprovados saem ranqueados (risco/recomendado) e com ia_revisao", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer });
    if (out.candidatos.length > 0) {
      expect(out.candidatos[0]!).toHaveProperty("risco");
      expect(out.candidatos[0]!.recomendado).toBe(true);
      expect(out.candidatos[0]!).toHaveProperty("ia_revisao");
    }
    expect(out.ia).toHaveProperty("topo_explicacao");
    expect(Array.isArray(out.ia.alertas)).toBe(true);
  });

  it("candidatos trazem trace e stats_detalhadas mesmo sem diagnostics (drawer do front)", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer });
    expect(out.candidatos.length).toBeGreaterThan(0);
    expect(out.candidatos[0].trace).toBeDefined();
    expect(out.candidatos[0]).toHaveProperty("stats_detalhadas");
    expect(out.reprovados).toEqual([]); // segue gated por diagnostics
  });

  it("candidato jogador carrega titularidade=provavel (sem xi confirmado) e tem chave posicao", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClientNoXi(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });
    const all = [...out.candidatos, ...out.reprovados];
    const havertz = all.find((c: any) => String(c.jogador).includes("Havertz"));
    expect(havertz).toBeDefined();
    expect(havertz!.titularidade).toBe("provavel");
    expect("posicao" in havertz!).toBe(true);
  });
});
