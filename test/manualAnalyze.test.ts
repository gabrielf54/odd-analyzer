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

/** Variante do fakeClient com playerStats de PASSES (total_pass) p/ a escada de passes.
 * 12 jogos, ~45 passes em 90 min → μ de passes ~45 (no entorno das linhas testadas). */
function fakeClientPasses(): any {
  const base = fakeClient();
  return {
    ...base,
    async playerStats() {
      return { results: Array.from({ length: 12 }, () => ({ total_pass: 45, minutes_played: 90 })) };
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

  it("pré-lineup: pendente_lineup=true e nenhum recomendado", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClientNoXi(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });
    expect(out.pendente_lineup).toBe(true);
    expect(out.candidatos.every((c: any) => c.recomendado !== true)).toBe(true);
  });

  it("pós-confirmação: pendente_lineup=false", async () => {
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer });
    expect(out.pendente_lineup).toBe(false);
  });

  it("I1 regressão: mercado de partida 1x2 SÓ over (sem under) NÃO estoura e sai sem_devig", async () => {
    const repo = new InMemoryRepo();
    // vitoria é isenta da exigência de 2 lados (schema.ts); antes do fix, o ramo de
    // partida coalescia odd_under para 0 → impliedProb(0) lançava e abortava a análise.
    const run = analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "vitoria", entidade: "partida", linha: 0, odd_over: 1.8, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });
    await expect(run).resolves.toBeDefined();
    const out = await run;
    const all = [...out.candidatos, ...out.reprovados];
    const vit = all.find((c: any) => String(c.market_type) === "vitoria");
    expect(vit).toBeDefined();
    expect(vit!.sem_devig).toBe(true); // conservador: 1/odd_over, sem inventar margem
  });

  it("vitoria com 3 resultados (1X2) gera candidatos DISTINTOS — não colide no paper_ledger", async () => {
    // Regressão do erro "ON CONFLICT DO UPDATE command cannot affect row a second time"
    // (2026-06-12): as 3 linhas de vitória (mandante/empate/visitante) viravam todas
    // "mandante" com a MESMA chave (jogador,linha,market) → o upsert do ledger quebrava.
    // fakeClient: home_team="Germany", away_team="Scotland".
    const repo = new InMemoryRepo();
    const out = await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [
        { market_type: "vitoria", entidade: "Germany", linha: 0, odd_over: 1.5, odd_under: null, book: "b" },
        { market_type: "vitoria", entidade: "empate", linha: 0, odd_over: 3.4, odd_under: null, book: "b" },
        { market_type: "vitoria", entidade: "Scotland", linha: 0, odd_over: 6.0, odd_under: null, book: "b" },
      ],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });

    const vit = [...out.candidatos, ...out.reprovados].filter((c: any) => c.market_type === "vitoria");
    expect(vit).toHaveLength(3);
    expect(new Set(vit.map((c: any) => c.jogador)).size).toBe(3); // 3 desfechos distintos
    // O que entrou no ledger (edge>0) não pode ter chave repetida.
    const led = repo.ledger.filter((r: any) => r.market_type === "vitoria");
    expect(new Set(led.map((r: any) => `${r.jogador}|${r.linha}`)).size).toBe(led.length);
  });

  it("grava no paper_ledger os candidatos com edge>0 (calibração forward)", async () => {
    const repo = new InMemoryRepo();
    await analyzeManual(fakeClient(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: [{ market_type: "sot", entidade: "K. Havertz", linha: 0.5, odd_over: 3.0, odd_under: null, book: "b" }],
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer });
    // Havertz: 12 jogos SOT=3 vs odd 3.0 linha 0.5 → edge>0 esperado
    expect(repo.ledger.length).toBeGreaterThan(0);
    for (const row of repo.ledger) {
      expect(row.event_id).toBe("e1");
      expect(typeof row.prob_modelo).toBe("number");
      expect(row.edge).toBeGreaterThan(0);
      expect(row).toHaveProperty("player_id");
      expect(row).toHaveProperty("odd_flag");
    }
  });

  it("escada de passes: agrupa degraus por jogador e de-viga a escada inteira (ladderDevig)", async () => {
    const repo = new InMemoryRepo();
    // 5 degraus "N+" (convenção linha=N-0.5) p/ o MESMO jogador, odds crescentes
    // (implícitas decrescentes = monótono) → ladderDevig AJUSTA (sem_devig=false).
    const degraus = [
      { linha: 39.5, odd_over: 1.7 },
      { linha: 44.5, odd_over: 1.9 },
      { linha: 49.5, odd_over: 2.1 },
      { linha: 54.5, odd_over: 2.4 },
      { linha: 59.5, odd_over: 2.8 },
    ];
    const out = await analyzeManual(fakeClientPasses(), {
      event_id: "e1", coletado_em: "2026-06-14T18:30:00Z",
      odds: degraus.map((d) => ({
        market_type: "passes", entidade: "K. Havertz", linha: d.linha,
        odd_over: d.odd_over, odd_under: null, book: "b",
      })),
      linhas_rejeitadas: [], escopo_historico: "todos",
    }, { repo, reviewerFn: fakeReviewer, diagnostics: true });

    const all = [...out.candidatos, ...out.reprovados];
    const passes = all.filter((c: any) => c.market_type === "passes");
    // saem os 5 degraus, todos do mercado passes
    expect(passes.length).toBe(5);
    // a escada ajustou → sem_devig=false em TODOS (não caiu no fallback conservador)
    expect(passes.every((c: any) => c.sem_devig === false)).toBe(true);
    // e o prob_devig é a prob JUSTA da escada — diferente da implícita crua 1/odd_over
    expect(passes.some((c: any) => Math.abs(c.prob_devig - 1 / c.odd) > 1e-6)).toBe(true);
    // passes é DIAGNÓSTICO (sem validated_lines) → nunca ganha estrela
    expect(out.candidatos.every((c: any) => c.recomendado !== true)).toBe(true);
  });
});
