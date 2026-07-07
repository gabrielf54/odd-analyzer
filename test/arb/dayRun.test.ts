// Job "analisar dia inteiro": lista os jogos do dia (fuso BR), coleta odds jogo a jogo
// (serializado — headless compartilhado) e escaneia arbitragem após cada jogo. Registro
// de jobs em memória (restart perde só a barra de progresso; odds ficam no banco).
import { describe, it, expect, beforeEach } from "vitest";
import {
  diaLocalBR, matchesOnDay, runDayJob, scanDayOdds,
  createDayJob, getDayJob, hasRunningJob, resetDayJobs,
} from "../../src/arb/dayRun.js";
import type { ArbOddsRow } from "../../src/arb/surebet.js";

const row = (event_id: string, book: string, odd_over: number, odd_under: number | null): ArbOddsRow => ({
  event_id, entidade: "partida", market_type: "gols", linha: 2.5,
  odd_over, odd_under, odd_draw: null, book, coletado_em: "2026-07-06T10:00:00.000Z",
});

describe("diaLocalBR / matchesOnDay — dia no fuso do dono (America/Sao_Paulo)", () => {
  it("meia-noite UTC de 7/jul é ainda 6/jul no BR (UTC-3)", () => {
    expect(diaLocalBR("2026-07-07T00:00:00+00:00")).toBe("2026-07-06");
    expect(diaLocalBR("2026-07-07T16:00:00+00:00")).toBe("2026-07-07");
  });

  it("filtra a lista da liga pelo dia BR", () => {
    const ms = [
      { id: 1, data: "2026-07-07T00:00:00+00:00" },  // 6/jul BR
      { id: 2, data: "2026-07-07T16:00:00+00:00" },  // 7/jul BR
      { id: 3, data: "2026-07-07T20:00:00+00:00" },  // 7/jul BR
      { id: 4, data: "2026-07-09T20:00:00+00:00" },
    ];
    expect(matchesOnDay(ms, "2026-07-07").map((m) => m.id)).toEqual([2, 3]);
    expect(matchesOnDay(ms, "2026-07-06").map((m) => m.id)).toEqual([1]);
  });
});

describe("runDayJob — coleta serial + scan incremental, erro isolado por jogo", () => {
  beforeEach(() => resetDayJobs());

  it("coleta cada jogo, escaneia e conclui; arbitragem aparece com o rótulo do jogo", async () => {
    const job = createDayJob({
      league_id: "27", data: "2026-07-07", total: 200,
      jogos: [
        { event_id: "8381", jogo: "Argentina x Egypt" },
        { event_id: "8382", jogo: "Switzerland x Colombia" },
      ],
      agora: "2026-07-06T12:00:00.000Z",
    });
    const coletados: string[] = [];
    await runDayJob(job, {
      collectEvent: async (id) => { coletados.push(id); return { gravadas: 10 }; },
      getOdds: (id) => id === "8381"
        ? [row("8381", "betano", 2.05, null), row("8381", "kto", 1.7, 2.1)]
        : [row("8382", "kto", 1.9, 1.9)],
    });
    expect(coletados).toEqual(["8381", "8382"]); // serial, na ordem
    expect(job.estado).toBe("concluido");
    expect(job.jogos.every((g) => g.estado === "ok")).toBe(true);
    expect(job.jogos[0]!.n_odds).toBe(2);
    expect(job.oportunidades).toHaveLength(1);
    expect(job.oportunidades[0]!.jogo).toBe("Argentina x Egypt");
    expect(job.oportunidades[0]!.tier).toBe("imperdivel");
  });

  it("coleta que falha marca o jogo com erro mas NÃO derruba o dia; scan usa o que há no banco", async () => {
    const job = createDayJob({
      league_id: "27", data: "2026-07-07", total: 200,
      jogos: [
        { event_id: "1", jogo: "A x B" },
        { event_id: "2", jogo: "C x D" },
      ],
      agora: "2026-07-06T12:00:00.000Z",
    });
    await runDayJob(job, {
      collectEvent: async (id) => { if (id === "1") throw new Error("headless caiu"); return { gravadas: 5 }; },
      getOdds: (id) => id === "1" ? [row("1", "betano", 2.05, null), row("1", "kto", 1.7, 2.1)] : [],
    });
    expect(job.estado).toBe("concluido");
    expect(job.jogos[0]!.estado).toBe("erro");
    expect(job.jogos[0]!.erro).toMatch(/headless/);
    // mesmo com coleta falha, o banco tinha odds → arbitragem do jogo 1 aparece
    expect(job.oportunidades.some((o) => o.event_id === "1")).toBe(true);
    expect(job.jogos[1]!.estado).toBe("ok");
  });
});

describe("registro de jobs em memória", () => {
  beforeEach(() => resetDayJobs());

  it("createDayJob/getDayJob; hasRunningJob bloqueia segundo job simultâneo", async () => {
    const job = createDayJob({ league_id: "27", data: "2026-07-07", total: 200, jogos: [{ event_id: "1", jogo: "A x B" }], agora: "2026-07-06T12:00:00.000Z" });
    expect(getDayJob(job.id)).toBe(job);
    expect(getDayJob("nao-existe")).toBeNull();
    expect(hasRunningJob()).toBe(true); // criado = rodando
    await runDayJob(job, { collectEvent: async () => ({ gravadas: 0 }), getOdds: () => [] });
    expect(hasRunningJob()).toBe(false);
  });
});

describe("scanDayOdds — re-scan instantâneo do banco (sem coletar)", () => {
  it("agrega oportunidades de vários jogos ordenadas por soma_inversos", () => {
    const out = scanDayOdds([
      { event_id: "1", jogo: "A x B", rows: [row("1", "betano", 2.0, null), row("1", "kto", 1.5, 1.98)] },     // quase
      { event_id: "2", jogo: "C x D", rows: [row("2", "betano", 2.05, null), row("2", "kto", 1.5, 2.1)] },     // imperdível
    ], 200);
    expect(out).toHaveLength(2);
    expect(out[0]!.jogo).toBe("C x D");
    expect(out[0]!.tier).toBe("imperdivel");
    expect(out[1]!.tier).toBe("quase");
  });
});
