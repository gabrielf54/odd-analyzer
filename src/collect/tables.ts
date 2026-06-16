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

// Superbet (Betler, odds via Fastly). CONFIRMADO na captura de 2026-06-15 (deslogado, BR;
// Suécia×Tunísia, evento 12512182). A casa NÃO expõe rótulo EN (campo `code` = null) e o
// marketName em PT varia → a CHAVE é o marketId NUMÉRICO (estável, id de mercado Sportradar/
// Betler), emitido como string pelo parser. Liquidação Sportradar/Betradar (mesmos stats da
// Betnacional): desarmes "realizados" = GANHOS (won_tackle), faltas = COMETIDAS, SOT
// on-target (≠ Finalizações). Os marketIds de jogador que NÃO queremos (subtipos pé esq/dir,
// cabeceio, fora da área, "vezes desarmado", impedimentos) caem como não-mapeados →
// fail-closed. "Faltas Sofridas" (238449) tem reject explícito p/ não confundir com cometidas.
export const SUPERBET_TABLE: HouseMarketTable = {
  "236220": { market_type: "sot" },          // "Jogador - Chutes no Gol" (on-target)
  "236218": { market_type: "finalizacoes" }, // "Jogador - Finalizações" (total de chutes)
  "236222": { market_type: "desarmes" },     // "Jogador - Total de Desarmes" = realizados (won_tackle)
  "236216": { market_type: "faltas" },       // "Jogador - Faltas Cometidas"
  "238449": { reject: "faltas SOFRIDAS (Jogador - Faltas Sofridas) — modelamos só as COMETIDAS" },
};

// Stake (plataforma PRÓPRIA, sbweb.stake.bet.br). CONFIRMADO na captura de 2026-06-15 (deslogado,
// BR; Espanha×Cabo Verde 1025862165 + Bélgica×Egito 1025862146). NÃO é Kambi — motor proprietário
// (1ª casa com motor de preço independente → diversidade real). A CHAVE é o marketId NUMÉRICO
// (id de TIPO de mercado, GLOBAL, igual nos 2 jogos; o parser emite a BASE, sem o sufixo _NN de
// linha do /markets). Liquidação Opta (igual KTO): desarmes "completados" = GANHOS (won_tackle),
// faltas "concedidas" = COMETIDAS. "Faltas ganhas" (1007684761) = SOFRIDAS → reject explícito.
export const STAKE_TABLE: HouseMarketTable = {
  "1002035662": { market_type: "sot" },          // "Chutes a gol pelo jogador" (Opta SOT)
  "1004544421": { market_type: "finalizacoes" }, // "Chutes pelo jogador" (Opta total shots)
  "1001809658": { market_type: "desarmes" },     // "Desarmes completados pelo Jogador" = won_tackle
  "1007684754": { market_type: "faltas" },       // "Faltas concedidas pelo jogador" = cometidas
  "1007684761": { reject: "faltas SOFRIDAS (Faltas ganhas pelo jogador) — modelamos só as COMETIDAS" },
};

// Betano (plataforma PRÓPRIA, www.betano.bet.br). CONFIRMADO na captura de 2026-06-15 (deslogado,
// BR; França×Senegal, eventId 77353568). A CHAVE é o market.typeId NUMÉRICO (id de TIPO de mercado,
// GLOBAL — o mesmo em qualquer jogo), emitido como string pelo parser. Liquidação Opta: "Total de
// Desarmes" (599) = GANHOS (won_tackle) — a pesquisa web confirmou que a Betano conta tackle GANHO
// via Opta, não tentado; "Faltas cometidas" (1000679) = fouls committed. Rejeitados explícitos:
// "Faltas ganhas" (1000678) = SOFRIDAS, e os subtipos de 1º tempo (1000680/1000681). Demais typeIds
// (assistências/passes/cartão/gols...) caem como "não mapeado" → fail-closed.
export const BETANO_TABLE: HouseMarketTable = {
  "596": { market_type: "sot" },          // "{Jogador} Chutes no gol" (on-target)
  "595": { market_type: "finalizacoes" }, // "{Jogador} Total de chutes" (total shots)
  "599": { market_type: "desarmes" },     // "{Jogador} Total de Desarmes" = ganhos (won_tackle)
  "1000679": { market_type: "faltas" },   // "{Jogador} Faltas cometidas" (fouls committed)
  "1000678": { reject: "faltas SOFRIDAS (Faltas ganhas) — modelamos só as COMETIDAS" },
  "1000680": { reject: "subtipo de 1º tempo (Total de chutes - Primeiro Tempo)" },
  "1000681": { reject: "subtipo de 1º tempo (Chutes no gol - Primeiro Tempo)" },
};

/** Tabela de-para de uma casa pelo slug. Casa desconhecida → tabela vazia (rejeita tudo). */
export function tableFor(book: string): HouseMarketTable {
  switch (book) {
    case "kto": return KTO_TABLE;
    case "betnacional": return BETNACIONAL_TABLE;
    case "superbet": return SUPERBET_TABLE;
    case "stake": return STAKE_TABLE;
    case "betano": return BETANO_TABLE;
    default: return {};
  }
}
