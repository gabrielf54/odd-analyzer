# Arbitragem (surebet) — "Apostas Imperdíveis"

> **Feature PENDENTE** (esta pasta some quando shipar — regra do CLAUDE.md).
> Spec escrita em 2026-07-06.

## O que é (linguagem leiga)

Casas diferentes discordam de preço. Quando a **Betano paga 2.05 no "Mais de 1.5 gols"** e a
**KTO paga 2.10 no "Menos de 1.5 gols"**, dá pra apostar **nos dois lados ao mesmo tempo** e
ganhar **qualquer que seja o resultado**. Isso é arbitragem (surebet): não é palpite, é
matemática — a soma dos inversos das odds ficou abaixo de 1 (1/2.05 + 1/2.10 = 0.964), então
existe uma divisão dos R$200 que trava lucro nos dois cenários.

O módulo:
1. Usuário escolhe **liga + dia** no front e aperta um botão.
2. Backend **coleta as odds de TODOS os jogos daquele dia** nas 5 casas (KTO, Betnacional,
   Superbet, Stake, Betano), jogo a jogo, mostrando progresso.
3. Compara **linha por linha, casa por casa, em TODOS os mercados que têm dois (ou três)
   lados** — gols, escanteios, vitória (1X2), props de jogador quando a casa oferece o
   "menos de".
4. Mostra as **imperdíveis**: quanto colocar em cada perna (ex.: R$110 na Betano, R$90 na
   KTO) e o lucro garantido em R$ e %.

**Diferença do resto do produto:** aqui NÃO há modelo/probabilidade — é preço × preço.
Não toca o money-path (`model/`, `value/`), não mexe em calibração, gate de paridade intacto.

## Por que hoje quase não acharíamos nada (e o que muda)

O que a coleta grava hoje:
- 4 das 5 casas ofertam props de jogador como **escada "N+" só over** — sem o lado "menos",
  não há par pra fechar arbitragem. Só a KTO (Kambi) traz over+under juntos.
- **Mercados de partida (gols/escanteios/1X2) são descartados** pelos parsers/de-paras
  (foco era prop de jogador). E são exatamente onde toda casa tem os dois/três lados.
- 1X2 não tem onde guardar o **empate** (`odd_draw` não existe no schema).

Logo o grosso do trabalho é **abrir a torneira dos mercados de partida + lado under**,
mantendo a filosofia fail-closed (rótulo/id não confirmado em captura real → rejeitado).

## Decisões de design

### D1 — Motor lê o `odds` CRU, não o espelho unificado
`odds_unificadas` guarda só a casa vencedora do over (line shopping) — arbitragem precisa
do melhor preço **de cada lado**, que pode estar em casas diferentes. O motor agrupa as
linhas cruas por `(entidade normalizada, market_type, linha)` usando o mesmo
`normalize()` do crosswalk (consistente com a unificação). O espelho não muda.

### D2 — `odd_draw` ponta a ponta (só p/ `vitoria`)
Coluna nova `odd_draw numeric` (nullable) em `odds` + campo opcional em
`RawCollectedLine`/`ManualOddsLine`/`NormalizedLine`/`OddsRow`. Convenção do fio mantida:
`vitoria` = `linha 0`, `odd_over`=casa, `odd_under`=fora, `odd_draw`=empate. Migração via
`apply_migration` (`add_odd_draw_to_odds`) espelhada em `schema.sql` no mesmo commit.
Subtype novo `"1x2"` na whitelist do normalizer. `odds_unificadas` NÃO ganha a coluna
(motor lê o cru — D1).

### D3 — Parsers: captura dos 2 lados + mercados de partida, fail-closed
Por casa (ids/rótulos EXATOS virão do recon ao vivo — ver D5):
- **KTO (Kambi)**: parser já agrupa over/under e já emite `entidade:"partida"`. Falta:
  (a) de-para dos rótulos de partida (ex.: "Total Goals", "Total Corners"); (b) 1X2 via
  outcomes `OT_ONE`/`OT_CROSS`/`OT_TWO` → uma raw `subtype:"1x2"`.
- **Stake**: hoje descarta `oddTypeName !== "Mais"`. Passa a parear "Mais"/"Menos" por
  `(marketId, linha)` → `odd_over`/`odd_under`; 1X2 pelo shape real do payload.
- **Betano**: hoje pula `market.playerId == null`. Passa a parsear mercados de partida
  por `typeId` (totais com selections Mais/Menos; 1X2 com 3 selections).
- **Superbet**: hoje pula outcome sem jogador. Passa a emitir os de partida
  (`entidade:"partida"`), pareando over/under por `(marketId, specifiers.total)`.
- **Betnacional (Bet6)**: `classify()` ganha famílias de partida via `market_code` EN
  ancorado (ex.: total de gols over/under, 1X2).
- Props de jogador: onde a casa expuser o lado "menos" (payload real dirá), capturar no
  mesmo par — sem inventar.

### D4 — Motor puro `src/arb/surebet.ts`
- **2 vias**: melhor `odd_over` entre casas × melhor `odd_under` entre casas (mesma chave).
  `S = 1/over + 1/under`. Arbitragem se `S < 1`.
- **3 vias** (`vitoria`): melhor casa/empate/fora entre casas; `S = soma dos 3 inversos`.
- **Split**: stake da perna i = `T·(1/oᵢ)/S`, **arredondado a reais inteiros**; lucro
  garantido = `min(sᵢ·oᵢ) − T` **recalculado após o arredondamento** (nunca prometer
  centavo que o arredondamento comeu). `T` default 200, configurável.
- **Tiers**: `imperdivel` (S<1) e `quase` (1 ≤ S < 1.02, exibida em âmbar como radar —
  a tela nunca fica vazia e o usuário vê o quão perto o mercado esteve).
- **Honestidade temporal**: cada perna carrega `coletado_em`; o resultado expõe
  `defasagem_min` (minutos entre a perna mais velha e a mais nova). Odds coletadas em
  momentos distantes podem ser arbitragem-fantasma (preço já mexeu) — a UI avisa.
- Consistência de liquidação: parear só dentro do mesmo `market_type` (as de-paras já
  garantem que `desarmes` = won_tackle em toda casa, etc.).
- Linhas inteiras (asiáticas, com push) já são rejeitadas pelo `parseLinha` (só .5) —
  sem cenário de devolução.

### D5 — Recon ao vivo ANTES do de-para (regra da casa: string exata sai de captura)
`scripts/recon-match-markets.mts`: para um jogo real (Copa está no mata-mata AGORA),
busca o payload cru de cada casa (fetch puro/headless via `makeFetchers`) e salva os JSON
no scratchpad. Daí saem os ids/rótulos exatos + fixtures reais pros testes de parser.
Sem captura → mercado fica fail-closed (não adivinhamos por substring).

### D6 — Job "dia inteiro" com progresso (in-memory + polling)
- `POST /arbitragem/analisar-dia` `{league_id, data:"YYYY-MM-DD", total?:200}` →
  `{job_id, total_jogos}`. Lista os jogos da liga via `listMatches` e filtra pelo dia.
- Job roda **serializado** (headless compartilhado não tolera concorrência — lição do
  Stake) reusando `coletarOddsService` por jogo; após cada jogo roda o scan de arbitragem
  e acumula. Registro de jobs **em memória** (restart perde só a barra de progresso; as
  odds ficam no banco e o re-scan recupera tudo).
- `GET /arbitragem/jobs/:id` → `{estado, total_jogos, concluidos, jogos:[{event_id, jogo,
  estado, n_odds, erro?}], oportunidades:[...]}` (front faz polling de 2s).
- `GET /arbitragem/dia?league_id&data&total` → **re-scan instantâneo** só do que está no
  banco (sem coletar) — pra reconferir sem pagar nova coleta.
- Zod na borda; chaves do fio em snake_case PT (convenção inegociável).

### D7 — Front `/imperdiveis`
- Seletor de liga (reusa `getLeagues`/`LeagueRail`), input de data (default hoje), stake
  total (default R$200), botão "Analisar dia inteiro".
- Durante o job: barra de progresso (`concluidos/total_jogos`) + linha por jogo (ok/erro).
- Resultado: cards ordenados por lucro %, verde `IMPERDÍVEL` / âmbar `QUASE`:
  jogo, mercado em **linguagem leiga** ("Mais de 2.5 gols" / "Menos de 2.5 gols"),
  cada perna com `BookBadge` + odd + **quanto apostar (R$ inteiros)**, lucro garantido
  em R$ e %, e aviso de defasagem quando as pernas foram coletadas longe uma da outra.
- Link "imperdíveis" no nav do `layout.tsx`. Padrão de estado: `useState`+`useEffect`+
  polling (igual `/agendador`). Tema/classes existentes (`.panel`, `.btn`, `Tag`).

## Estrutura de saída do motor (fio)

```jsonc
{
  "event_id": "8311",
  "jogo": "França x Brasil",
  "market_type": "gols",
  "linha": 2.5,
  "tipo": "2vias",              // ou "3vias"
  "tier": "imperdivel",          // ou "quase"
  "soma_inversos": 0.9643,
  "lucro_pct": 3.7,              // sobre T, APÓS arredondamento
  "lucro_garantido": 7.0,        // R$, pior cenário
  "total": 200,
  "pernas": [
    { "lado": "over",  "rotulo": "Mais de 2.5 gols",  "book": "betano", "odd": 2.05, "stake": 103, "retorno": 211.15, "coletado_em": "..." },
    { "lado": "under", "rotulo": "Menos de 2.5 gols", "book": "kto",    "odd": 2.10, "stake": 97,  "retorno": 203.70, "coletado_em": "..." }
  ],
  "defasagem_min": 0
}
```

## Testes
- Motor: arb 2-vias, 3-vias, sem-arb, tier quase, arredondamento (lucro nunca negativo em
  tier imperdivel após arredondar — se ficar, degrada pra quase), entidade normalizada
  casando cross-casa, defasagem.
- Parsers: fixtures REAIS do recon por casa (partida + under + 1X2).
- Job/serviço: fakes (`InMemoryRepo`, collectors falsos), filtro por dia, erro em um jogo
  não derruba o dia.
- Rotas: Zod rejeita data/liga inválidas.
- Suíte inteira + typecheck verdes; gate de paridade intocado.

## Riscos assumidos
- **Arb real é rara e efêmera** — por isso o tier "quase" e o aviso de defasagem: o
  produto mostra a verdade, não promete milagre (doutrina do produto).
- Payload de mercado de partida de Betano/Superbet/Stake/Bet6 nunca foi capturado —
  shapes podem surpreender; fail-closed segura, recon resolve.
- Limites/regras das casas (conta limitada por arbitragem) — problema do apostador,
  fora do escopo do software.
