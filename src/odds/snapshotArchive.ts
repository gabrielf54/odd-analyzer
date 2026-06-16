// ARQUIVO-ARQUIVO de odds (JSONL append-only): uma "foto" do quadro COMPLETO de odds da
// BSD a cada vez que o loop as busca. A BSD NÃO guarda histórico (só a odd de agora) → sem
// estas fotos, o quadro de abertura/fechamento de TODOS os mercados some pra sempre. É
// SEGURO/forense, NÃO substitui o banco (o `paper_ledger` segue a fonte da verdade do que
// a gente aposta). Permite re-análise futura (outros mercados, movimento da linha).
// I/O isolado — o motor puro (model/value) NÃO importa isto; só os CLIs do loop chamam.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface OddsSnapshot {
  ts: string;        // ISO (momento da foto)
  fase: string;      // "abertura" | "fechamento"
  event_id: string;
  jogo?: string;
  odds: unknown;     // quadro CRU da casa (o objeto `.odds` plano da BSD)
}

/** 1 foto = 1 linha JSON. Função PURA/determinística (testável). */
export function formatSnapshotLine(s: OddsSnapshot): string {
  return JSON.stringify(s);
}

export const DEFAULT_SNAPSHOT_PATH = "data/odds-snapshots.jsonl";

/** Anexa uma foto ao arquivo (cria a pasta se faltar). Append-only: nunca reescreve. */
export function appendOddsSnapshot(s: OddsSnapshot, filePath: string = DEFAULT_SNAPSHOT_PATH): void {
  mkdirSync(dirname(filePath), { recursive: true });
  appendFileSync(filePath, formatSnapshotLine(s) + "\n", "utf8");
}
