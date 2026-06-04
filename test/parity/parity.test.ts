// GATE DE PARIDADE. As golden files (golden/engine.json) foram geradas pelo motor
// Python de referência (scripts/gen_golden_parity.py, removido junto com o Python em
// 2026-06-04 após o e2e ao vivo passar). Ficam CONGELADAS: o motor TS tem que
// reproduzi-las em 1e-9. Se o motor mudar e divergir, o gate quebra — re-derivar exige
// recuperar o gerador Python do histórico do git (até a remoção do legado).
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { probOverLine } from "../../src/model/sotModel.js";
import { scoreMatrix, probs1x2, probTotalOver } from "../../src/model/matchModel.js";
import { fairProbOver } from "../../src/value/devig.js";
import { edgeEv } from "../../src/value/ev.js";

const here = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(here, "golden", "engine.json"), "utf8"));
const TOL = 1e-9;

describe("GATE de paridade Python↔TS", () => {
  it("mercados de contagem (Poisson/NB2) batem em 1e-9", () => {
    for (const c of golden.count) {
      const got = probOverLine(c.mu, c.line, c.r);
      expect(Math.abs(got - c.prob)).toBeLessThan(TOL);
    }
  });

  it("modelo de partida (Dixon-Coles) bate em 1e-9", () => {
    for (const c of golden.match) {
      const m = scoreMatrix(c.lh, c.la);
      const p = probs1x2(m);
      expect(Math.abs(p.home - c.home)).toBeLessThan(TOL);
      expect(Math.abs(p.draw - c.draw)).toBeLessThan(TOL);
      expect(Math.abs(p.away - c.away)).toBeLessThan(TOL);
      expect(Math.abs(probTotalOver(m, 1.5) - c.over15)).toBeLessThan(TOL);
      expect(Math.abs(probTotalOver(m, 2.5) - c.over25)).toBeLessThan(TOL);
    }
  });

  it("de-vig + EV batem em 1e-9", () => {
    for (const c of golden.value) {
      const fair = fairProbOver(c.oo, c.ou);
      const m = edgeEv(0.55, fair, c.oo);
      expect(Math.abs(fair - c.fair_over)).toBeLessThan(TOL);
      expect(Math.abs(m.edge - c.edge)).toBeLessThan(TOL);
      expect(Math.abs(m.ev - c.ev)).toBeLessThan(TOL);
    }
  });
});
