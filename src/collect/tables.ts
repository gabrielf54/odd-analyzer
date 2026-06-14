// De-para por casa: rótulo CRU da casa (normalizado lower/trim) → market_type canônico.
// FAIL-CLOSED: rótulo ausente da tabela é REJEITADO (nunca adivinha por substring).
//
// As strings exatas saem da captura no DevTools de cada casa (Fase 0; ver
// docs/features/coleta-odds-automatica/casas/*.md). Ponto crítico já resolvido p/ a KTO:
// a REGRA DE LIQUIDAÇÃO (qual stat Opta a casa paga) — desarmes = GANHOS (won_tackle),
// faltas = COMETIDAS vs sofridas (mercados separados). Na dúvida → FORA da tabela (rejeita).

import type { HouseMarketTable } from "./normalizer.js";

// KTO (Kambi) — CONFIRMADO na captura de 2026-06-14 (deslogado, BR; Alemanha–Curaçao,
// evento Kambi 1025862126). Chaves = englishLabel JÁ limpo pelo parser (cleanKambiLabel
// tira o sufixo "(Settled/Decided using Opta data)" e o apóstrofo) e depois lower/trim
// pelo normalizer. Todos os props liquidam por Opta (o próprio rótulo diz).
export const KTO_TABLE: HouseMarketTable = {
  "players shots on target": { market_type: "sot" },   // "Chutes a gol pelo jogador" — Opta SOT
  "players shots": { market_type: "finalizacoes" },     // "Chutes pelo jogador" — Opta total shots
  // "Desarmes completados pelo Jogador" = tackles GANHOS (Opta Tackles Won) = nosso
  // settle_field=won_tackle. Bate exato com o modelo (decomposição tentativas×aproveitamento).
  "player tackles": { market_type: "desarmes" },
  // "Faltas concedidas pelo jogador" = faltas COMETIDAS (Opta fouls) = nosso stat_field=fouls.
  "players fouls committed": { market_type: "faltas" },
  // "Faltas ganhas pelo jogador" = faltas SOFRIDAS (fouls won/drawn) — mercado DIFERENTE,
  // não modelamos. Fail-closed explícito (não confundir com o de cometidas).
  "players fouls won": { reject: "faltas SOFRIDAS (fouls won) — modelamos só as COMETIDAS" },
  // Mercados de PARTIDA (gols/escanteios): rótulos NÃO capturados nesta sessão (o foco era
  // prop de jogador). Ficam FORA até confirmar numa captura — fail-closed.
};

// Betnacional (NSX/Bet6, provider "ramp"). CONFIRMADO na captura de 2026-06-14 (deslogado,
// BR; Holanda×Japão, evento ramp 914873610). NÃO é GraphQL — é um GET REST. As chaves aqui
// são as FAMÍLIAS canônicas que o parser (parseBet6 → classify) emite após extrair a linha
// "N+" do nome do mercado. Liquidação: a Betnacional roda Sportradar/Opta (mesmos stats).
export const BETNACIONAL_TABLE: HouseMarketTable = {
  "shots on target": { market_type: "sot" },          // "N ou mais chutes no gol do jogador"
  "shots": { market_type: "finalizacoes" },            // "Jogador tem N ou mais Chutes"
  "fouls committed": { market_type: "faltas" },        // "Jogador comete N ou mais faltas"
  // "Jogador recebe N ou mais faltas" = faltas SOFRIDAS — mercado diferente, não modelamos.
  "fouls won": { reject: "faltas SOFRIDAS (recebidas) — modelamos só as COMETIDAS" },
  // Desarmes: NÃO ofertado neste evento (só KTO cobre desarme). Outros (gol/cartão/
  // assistência) caem como "não mapeado" — fail-closed.
};

/** Tabela de-para de uma casa pelo slug. Casa desconhecida → tabela vazia (rejeita tudo). */
export function tableFor(book: string): HouseMarketTable {
  switch (book) {
    case "kto": return KTO_TABLE;
    case "betnacional": return BETNACIONAL_TABLE;
    default: return {};
  }
}
