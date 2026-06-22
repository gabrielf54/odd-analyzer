import { describe, it, expect } from "vitest";
import { computeClvSegments } from "../src/backtest/clvSegments.js";

const snap = (coletado_em: string, lineup_status: string, odd_over: number) =>
  ({ coletado_em, lineup_status, odd_over });

describe("computeClvSegments (CLV derivado, segmentado pela escalação)", () => {
  it("série completa pred→pred→conf→conf: segmenta entrada/salto/pós/total + marcos", () => {
    const snaps = [
      snap("2026-06-22T09:00:00Z", "predicted", 2.0),
      snap("2026-06-22T12:00:00Z", "predicted", 1.9),
      snap("2026-06-22T14:00:00Z", "confirmed", 1.7),
      snap("2026-06-22T14:30:00Z", "confirmed", 1.6),
    ];
    const r = computeClvSegments(snaps, "2026-06-22T09:00:00Z", "2026-06-22T15:00:00Z");
    expect(r.pre_escalacao).toBeCloseTo(2.0 / 1.9 - 1, 9);   // entrada → último pré
    expect(r.salto_escalacao).toBeCloseTo(1.9 / 1.7 - 1, 9); // último pré → 1º pós (o sinal)
    expect(r.pos_escalacao).toBeCloseTo(1.7 / 1.6 - 1, 9);   // 1º pós → fechamento
    expect(r.total).toBeCloseTo(2.0 / 1.6 - 1, 9);           // entrada → fechamento
    expect(r.marcos.escalacao_em).toBe("2026-06-22T14:00:00Z");
    expect(r.marcos.entrada_odd).toBe(2.0);
    expect(r.marcos.fechamento_odd).toBe(1.6);
  });

  it("sem escalação confirmada ainda → salto/pós/pré null; total parcial até o último", () => {
    const snaps = [
      snap("2026-06-22T09:00:00Z", "predicted", 2.0),
      snap("2026-06-22T12:00:00Z", "predicted", 1.9),
    ];
    const r = computeClvSegments(snaps, "2026-06-22T09:00:00Z", "2026-06-22T15:00:00Z");
    expect(r.salto_escalacao).toBeNull();
    expect(r.pos_escalacao).toBeNull();
    expect(r.pre_escalacao).toBeNull();
    expect(r.total).toBeCloseTo(2.0 / 1.9 - 1, 9);
    expect(r.marcos.escalacao_em).toBeNull();
  });

  it("retrato APÓS o apito é ignorado no fechamento", () => {
    const snaps = [
      snap("2026-06-22T09:00:00Z", "predicted", 2.0),
      snap("2026-06-22T14:00:00Z", "confirmed", 1.7),
      snap("2026-06-22T16:00:00Z", "confirmed", 1.5), // depois do kickoff 15:00 → ignorado
    ];
    const r = computeClvSegments(snaps, "2026-06-22T09:00:00Z", "2026-06-22T15:00:00Z");
    expect(r.marcos.fechamento_odd).toBe(1.7);
    expect(r.total).toBeCloseTo(2.0 / 1.7 - 1, 9);
  });
});
