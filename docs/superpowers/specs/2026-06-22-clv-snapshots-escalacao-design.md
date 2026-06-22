# Spec — CLV por histórico imutável + ciente da ESCALAÇÃO (2026-06-22)

> Substitui a 1ª versão de CLV (captura por gatilho na coleta = gambiarra, acoplava
> coleta-pra-análise com captura-pra-CLV). Branch: `feat/validacao-edge-clv-odds`.

## 1. Problema

CLV (Closing Line Value) = "comprei antes do preço encurtar". Para um produto de
validação de modelo, é o sinal mais eficiente: cada aposta dá sinal antes do jogo
acabar. Mas a 1ª implementação **acoplou** duas coisas distintas:

- **Coletar odds para ANALISAR** — o dono faz à vontade, várias vezes, explorando.
- **Registrar entrada/fechamento para CLV** — precisa ser estável e imutável.

O gatilho `capturarFechamentoService` rodava em TODA coleta e sobrescrevia
`odd_fechamento`/`clv`; o `odd_flag` (entrada) era sobrescrito ao re-analisar. Os
números passavam a depender da sequência de cliques. Inviável.

**Além disso (pedido do dono):** o maior evento de informação do dia é a **escalação
oficial** (sai ~1h antes). As odds dão um salto quando ela confirma quem joga. O dono
quer que o analisador **identifique esse salto** e o use a favor (recomendar apostar
ANTES da escalação quando o modelo tende a ganhar no salto).

## 2. Princípio do design: histórico imutável + CLV DERIVADO

CLV deixa de ser "capturado por gatilho" e passa a ser **calculado na leitura** a partir
de um **histórico imutável de odds**. Coletar N vezes só **acrescenta retratos** — nada
é sobrescrito, logo **contaminar é impossível**. Desacopla coleta de CLV por construção.

## 3. Modelo de dados

### 3.1 Nova tabela `odds_snapshots` (append-only)
```
event_id text, entidade_norm text, entidade text, market_type text, linha numeric,
odd_over numeric, odd_under numeric, book text,
lineup_status text,        -- 'predicted' | 'confirmed' | 'unknown' NO momento do retrato
coletado_em timestamptz default now(),
id bigint identity pk
```
Índice `(event_id, entidade_norm, market_type, linha, coletado_em)`.
- **Fonte:** as odds **unificadas** (melhor preço por identidade — o que a análise usa),
  fotografadas a cada (re)coleta. Append, nunca update/delete.
- `lineup_status` vem do `lineup_status` do evento BSD no instante do retrato — é o que
  marca a fronteira pré/pós-escalação no tempo.
- **Kickoff** NÃO é guardado aqui — vem do `event_date` da BSD no momento do cálculo.

### 3.2 `paper_ledger` (sem mudança estrutural)
- `criado_em` = quando a aposta foi **logada pela 1ª vez** (insert; estável em upsert) =
  **o momento em que o modelo flagou valor** = a referência de ENTRADA (opção escolhida).
- `odd_flag` segue como informativo (a odd que a análise registrou). **O CLV não depende
  mais dele** → re-analisar não contamina nada.
- `odd_fechamento`/`clv`/`fechamento_em`: deixam de ser escritos por gatilho. Viram
  **derivados** (calculados dos snapshots na leitura). Colunas mantidas (cache opcional).

## 4. Cálculo do CLV (função PURA, segmentado pela escalação)

`computeClvSegments(snapshotsDaLinha, entryTime, kickoffTime)`:
- **entrada** = retrato em/imediatamente-antes de `entryTime` (as odds que o modelo viu);
  se não houver anterior, o 1º retrato.
- **fechamento** = último retrato com `coletado_em < kickoffTime`.
- **fronteira da escalação**: `ultimoPre` = último retrato `predicted` antes do 1º
  `confirmed`; `primeiroPos` = 1º retrato `confirmed`.
- CLV de preço entre dois retratos = `odd_a / odd_b − 1` (lado over da aposta).
- **Segmentos** (cada um `null` se faltar o marco):
  - `pre_escalacao` = clv(entrada, ultimoPre)
  - `salto_escalacao` = clv(ultimoPre, primeiroPos)   ← **o sinal-chave**
  - `pos_escalacao` = clv(primeiroPos, fechamento)
  - `total` = clv(entrada, fechamento)
- Devolve também os **marcos com horário** (`entrada_em`, `escalacao_em`, `kickoff`) p/ o
  front desenhar a linha do tempo. Determinístico, testável, sem I/O.

## 5. Recomendação de TIMING (pedido do dono — incluída neste corte)

`lineupEdge(segmentosDeVáriasApostas)` — agrega o `salto_escalacao` das apostas FLAGADAS
pelo modelo que já têm transição completa (pré→pós), por mercado:
- média do salto + **IC 95% (bootstrap, reusa `validation.ts`)** → "vantagem do modelo no
  salto da escalação".
- **Recomendação por aposta:** se a aposta está **pré-escalação** (ainda sem retrato
  `confirmed`) E o `lineupEdge` daquele mercado é **favorável e o IC não cruza o zero** →
  badge **"apostar agora (pré-escalação): o modelo ganha +X% no salto historicamente"**.
  Senão → "aguardar / sem sinal de timing".
- Honesto sobre amostra: com n pequeno o IC cruza zero → sem badge (anti-autoengano).

## 6. Fluxo (desacoplado)

- **Coletar/colar/unificar odds** → reprojeta unificadas → **append snapshot** (com
  `lineup_status` + horário). É só isso. (Remove o `capturarFechamentoService`.)
- **Analisar** (N vezes) → loga apostas; `criado_em` = 1º flag (entrada). Re-analisar: ok.
- **Ver CLV** → endpoint `GET /jogos/:eventId/clv` calcula do histórico (entrada/escalação/
  fechamento/segmentos + lineupEdge + recomendação). `report.ts` (CLI) usa o CLV derivado.

## 7. Front (repo `odd-analyzer-frontend`) — aba só-leitura "CLV / Linha"

Dentro do jogo, uma aba separada da análise (não polui o fluxo de coleta):
- **Resumo do jogo:** "vantagem do modelo no salto da escalação: +X% (IC …, n=…)".
- **Por aposta:** mini linha-do-tempo das odds com 3 marcos **[entrada] · [escalação] ·
  [apito]**; os 4 números segmentados; **badge de timing** quando pré-escalação favorável.
- Consome `GET /jogos/:eventId/clv`. Nenhuma mudança na tela de análise/coleta.

## 8. O que é REMOVIDO (a gambiarra, na mesma branch)

- `capturarFechamentoService` auto-hook em coletar/colar/unificar.
- Endpoint `POST /jogos/:eventId/capturar-fechamento`.
- `repo.applyClosingUpdates` (não há mais "capturar"; CLV é derivado).
- `clvCapture.ts::computeClosingUpdates` → reaproveitado/substituído por `computeClvSegments`.
- A migração `fechamento_em` permanece (cache opcional do derivado).

## 9. Testes (TDD)

- `computeClvSegments`: entrada/escalação/fechamento corretos; segmentos; marcos faltando
  (sem confirmado ainda → só parcial); ordenação por tempo.
- `lineupEdge` + recomendação: favorável com IC longe de zero → badge; n pequeno → sem badge.
- `appendSnapshot`/`getOddsSnapshots` (InMemory) + serviço `clvService` (compõe BSD kickoff
  + snapshots + ledger).
- Gate de paridade 1e-9 intacto; money-path (model/value) **não tocado**.

## 10. Money-path

CLV é validação/leitura — **não** altera nenhuma probabilidade. A recomendação de timing é
sobre QUANDO apostar, não muda `prob_modelo`/`edge`/`ev`. Princípio inegociável preservado.
