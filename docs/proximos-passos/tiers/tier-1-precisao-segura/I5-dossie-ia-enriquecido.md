# I5 — Dossiê da IA enriquecido (sinais de confronto como TEXTO, fora do money-path)

## 1. TL;DR
Dar à IA **sinais descritivos de confronto** (lado de ataque, posse do adversário, forma/tendência
recente, árbitro) como **campos no JSON** (snake_case PT, derivados do dado da BSD) — para melhorar o
**veto/ressalva** e a **explicação**, **sem tocar no número protegido**. A IA continua proibida de
calcular probabilidade; é o "experimento barato" que prepara o I2 (matchup direcional dentro do μ).

## 2. Status
- **Ajuda à meta:** **Médio** (melhora a *qualidade da explicação e do veto*, não o número — mas é o de maior valor de **produto** do tier).
- **Pronto p/ Copa:** ✅ Sim (não depende de calibração; só adiciona campos descritivos e ajusta o prompt).
- **Esforço:** **Médio**.
- **Risco de calibração/paridade:** **Nenhum** — não altera `prob_modelo`, nem o corte de edge, nem nada em `model/`/`value/`. As golden de `test/parity/` não são tocadas. **A IA segue proibida de calcular número.**
- **Custo de dado:** **$0** — todos os sinais (`average_positions`, `ball_possession`, `referee_id`, head-to-head) já vêm de graça na BSD (confirmado na sondagem 2026-06-11).

## 3. Problema / fundamento
Hoje a IA recebe um **escalar de time** por mercado — `concedido_adversario` (ex.: `"17.0"`) — **igual
para todo meia** do mesmo time. Ela explica e veta bem dentro do que tem, mas **não enxerga o confronto
decomposto**: não sabe que o ataque do adversário vem **pela esquerda**, que o adversário **tem 60% de
posse** (logo o nosso volante terá menos bola para desarmar), que o jogador **vinha em alta nos últimos
5 jogos**, ou que o **árbitro apita muito** (mais faltas/cartões → ritmo diferente).

O **diferencial do produto** é raciocinar em **confronto × concessão no mesmo eixo** (quem *produz* a
ação encontra quem *permite* aquela ação). O número (μ × multiplicador → `prob_modelo`) já tenta isso
no nível **por-mercado**. Mas o nível **direcional/zonal** (lado de ataque × posição do defensor) ainda
não está no μ — e ligá-lo lá é **arriscado** (mexe na calibração: é o I2, Tier 2).

A jogada barata e **sem risco** é: **computar a nota direcional e mostrá-la à IA como TEXTO**. A IA usa
para **ressalvar/vetar e explicar melhor**, o número segue intocado, e o **loop forward (I7)** mede se
apostas com nota de confronto favorável **ganham mais**. Se ganharem, vira a **evidência** para depois
ligar o direcional dentro do μ (I2). É o experimento que de-risca o I2 **antes** de tocar a calibração.

> **Por que entra como CAMPO, não como "conhecimento":** o prompt tem uma **ANCORAGEM anti-alucinação**
> que **proíbe** a IA de usar conhecimento externo sobre times/jogadores. Logo, todo sinal novo **tem
> que entrar como campo no JSON, derivado do dado** — nunca como "a IA sabe que esse time ataca pela
> esquerda". Caso contrário viola a própria âncora que impede a IA de inventar.

## 4. Evidência real (números + `file:line`)
- **A IA recebe os campos listados no prompt, e a ancoragem proíbe o resto:** `src/ai/reviewer.ts:5-56`
  (`PROMPT_REVISOR`). Os campos atuais estão listados em `:8-10`
  (`prob_modelo, prob_devig, edge, ev, risco, recomendado, amostra_jogos, incerteza, xi_confirmado,
  minutos_esperados, concedido_adversario, posicao, titularidade, alerta_minutos, concedido_posicao,
  stats_detalhadas`). A **ANCORAGEM** (`:17-24`) diz: *"NÃO use conhecimento externo… TODA afirmação
  deve ser derivável de um campo recebido"* — por isso sinal novo = **campo novo**.
- **O que a IA recebe de contexto hoje é mínimo:** `src/manual/analyze.ts:77` —
  `reviewerFn(ranked, { jogo: event.jogo ?? event.id })` → o `contexto` é só `{ jogo }`.
- **A IA é montada com `system` + `user` = `{ contexto, candidatos }`:** `src/ai/reviewer.ts:80-82`.
- **A IA NÃO calcula e NÃO decide apostar:** ela devolve apenas `stance` (`concorda|ressalva|veta`) +
  `nota`/`alertas` (`reviewer.ts:54-56`); o merge por `jogador|linha|market_type` está em `:97-101`.
  A decisão de apostar é do código (cortes em `candidates/filter.ts`, recomendado em `rank.ts`).
- **Dados ociosos disponíveis de graça na BSD** (sondagem 2026-06-11): `average_positions` (→ lado de
  ataque esquerda/direita), `ball_possession` em `/events/{id}/stats/` (→ posse do adversário),
  `referee_id` (→ tendência do árbitro), `head_to_head`. O motor **não lê** esses campos hoje (lê só 4
  campos de jogador + concessão de time — ver mapa do código no README do diretório).
- **Camada certa para derivar:** os campos do candidato são montados em `src/candidates/builder.ts:37-59`;
  o provider de stats que já lê a BSD e calcula concessão é `src/providers/stats.ts` (ex.: `teamConceded:49`).

## 5. Estado atual no código (o que existe / o que falta)
**Já existe:**
- `src/ai/reviewer.ts:5` — `PROMPT_REVISOR` (lista de campos + ancoragem + proibições de jargão).
- `reviewer.ts:72` — `reviewCandidates(candidatos, contexto, chatFn)`; `:80-82` monta as mensagens;
  `:97-101` faz o merge do `ia_revisao` por `jogador|linha|market_type`.
- `src/candidates/builder.ts:30` — `buildCandidate(...)` monta o dossiê (snake_case PT) de cada
  candidato; já carrega campos descritivos como `posicao`, `titularidade`, `concedido_posicao`,
  `stats_detalhadas` (todos **fora** do cálculo de `prob_modelo`).
- `src/manual/analyze.ts:77` — chamada da IA com `contexto = { jogo }` (mínimo, fácil de enriquecer).

**Falta:**
- **Derivar** os sinais descritivos novos a partir do dado BSD ocioso (`average_positions`,
  `ball_possession`, `referee_id`, h2h) — no **provider** (`src/providers/stats.ts`), retornando-os
  junto do `EntityRate`/contexto, **sem** entrá-los no cálculo de `mu`/`prob_modelo`.
- **Anexar** esses campos ao candidato (via `buildCandidate`, como mais um campo descritivo) e/ou ao
  `contexto` do jogo (em `analyze.ts:77`, expandir `{ jogo }`).
- **Atualizar** `PROMPT_REVISOR` para **listar** os campos novos, explicar o que significam em
  linguagem leiga, e **permitir citá-los** — mantendo a ancoragem (só do que está no JSON) e as
  proibições de jargão/inventar número.

## 6. Proposta de implementação
**Passo 1 — derivar 1–2 sinais descritivos primeiro (começar pequeno).** No provider
(`src/providers/stats.ts`), derivar do dado já buscado, **sem** usar no cálculo:
- `posse_adversario` (string/num) — de `ball_possession` do adversário em `/events/{id}/stats/`.
- `forma_tendencia` (string) — de `stats_detalhadas` (já existe!) comparando `media_5` vs `media_10`
  → ex.: `"em alta"`, `"em queda"`, `"estável"`. (Esse é o mais barato: o dado já está no candidato.)
- (depois) `nota_confronto` (string) — síntese do lado de ataque do adversário (de `average_positions`)
  × posição do nosso jogador → ex.: `"o time dele ataca mais pela direita; ele joga na direita"`.
- (depois) `arbitro_tendencia` (string) — de faltas/cartões médios do `referee_id`.

> **Regra de ouro:** esses campos são **descritivos** (texto/rótulo), **NÃO números que entrem no
> cálculo**. Se algum dia virarem multiplicador do μ, isso é **outro item** (I2) e exige calibração.

**Passo 2 — anexar ao candidato e/ou contexto (snake_case PT).** Exemplo de candidato enriquecido:
```jsonc
{
  "jogador": "Declan Rice", "linha": 2.5, "market_type": "desarmes",
  "prob_modelo": 0.54, "prob_devig": 0.42, "edge": 0.12, "ev": 0.10,   // ← número, INTOCADO
  "concedido_adversario": "17.0",
  // novos — DESCRITIVOS, fora do money-path:
  "forma_tendencia": "vem em alta nos últimos 5",
  "posse_adversario": 58,
  "nota_confronto": "o adversário ataca mais pela direita; ele atua na direita",
  "arbitro_tendencia": "árbitro apita bastante"
}
```
E/ou no contexto do jogo (`analyze.ts:77`): `{ jogo, posse_mandante, posse_visitante, arbitro_tendencia }`.

**Passo 3 — atualizar o `PROMPT_REVISOR`** (`src/ai/reviewer.ts:5`). Trecho a acrescentar (mantendo a
ancoragem e as proibições já existentes):
```text
CONFRONTO (novos campos, todos derivados do dado — cite SÓ o que vier preenchido):
forma_tendencia = como o jogador vem nos últimos jogos ('em alta'/'em queda'); posse_adversario =
quanto o adversário fica com a bola (mais posse do rival = menos bola pra ele desarmar/finalizar);
nota_confronto = encaixe do lado de ataque do adversário com a posição dele; arbitro_tendencia =
estilo do árbitro. Você PODE usar esses campos para reforçar um 'concorda', dar uma 'ressalva' ou
'vetar' — em linguagem comum ('o adversário fica muito com a bola, sobra pouco pra ele desarmar';
'vem numa boa fase'). Campo null = não mencionar. Continua PROIBIDO inventar número/estatística e
usar conhecimento que não esteja num campo recebido.
```
A IA **continua** devolvendo só `stance`+`nota`/`alertas` (`reviewer.ts:54-56`); **não** muda número e
**não** decide apostar (a decisão fica no código — `candidates/filter.ts` / `rank.ts`).

**Ports & Adapters:** a derivação dos sinais é I/O-adjacente → fica no **provider** (`stats.ts`), não no
domínio puro (`model/`/`value/`). `buildCandidate` só **carrega** o rótulo já pronto (como já faz com
`stats_detalhadas`). O motor não importa nada novo.

## 7. Plano de validação
**Não precisa de calibração** (não muda o número nem o corte de edge). Validação:
- **Testes unitários (offline):**
  - Os campos novos **chegam à IA**: dado um candidato/contexto com `forma_tendencia`/`posse_adversario`,
    o JSON enviado em `reviewCandidates` (`reviewer.ts:80-82`) contém esses campos.
  - **`reviewSchema` continua barrando candidato inventado** (a IA não pode introduzir jogador/linha
    fora dos recebidos) — `validateReview(obj, candidatos)` (`reviewer.ts:91`).
  - Degradação graciosa intacta: IA indisponível → `ia_revisao=null` em todos, sem vetar/aprovar falso.
- **Qualitativo:** revisar 5–10 dossiês reais e conferir que as explicações ficam mais úteis e **ainda
  leigas** (sem jargão; sem citar nomes de campo; 1–2 números traduzidos).
- **Forward (depende de I7), critério de aceite empírico:** registrar a `nota_confronto`/`forma_tendencia`
  junto da aposta no `paper_ledger` e, ao longo da Copa, conferir se apostas com **nota favorável**
  têm **CLV/acerto melhor** que as de nota neutra. Esse é o sinal que, se positivo, justifica I2.

## 8. Riscos & armadilhas
- **A IA sobre-pesar um sinal e vetar demais** (ou aprovar por "feeling"). Mitigar: a **decisão de
  apostar fica no código**; a IA só dá `stance`. Monitorar a taxa de veto no forward.
- **Inchar o prompt** (custo de token). É pequeno; começar com 1–2 campos e medir.
- **Quebrar a ancoragem** — não deixar a IA citar nada que não esteja num campo recebido; manter as
  proibições de jargão (`reviewer.ts:36-43`) e de citar nomes de campo (`:40`).
- **Derivar um número que vire money-path por engano (PROIBIDO).** Os campos são **descritivos**. Se um
  deles começar a influenciar `prob_modelo`/edge, parou de ser I5 e virou I2 (com calibração).
- **Não usar conhecimento externo** disfarçado de campo (ex.: rótulo "time forte" sem origem no dado).

## 9. Dependências
- **Nenhuma** para implementar (os dados BSD já existem; a infra de IA já existe).
- **Para medir o valor:** **I7** (forward) — para saber se a nota de confronto prediz.
- **Prepara:** **I2** (Tier 2, matchup direcional dentro do μ) — I5 é o experimento barato que o de-risca.

## 10. Esforço estimado
**Médio.** ~0,5 dia para o sinal mais barato (`forma_tendencia`, derivado do `stats_detalhadas` que já
existe) + atualizar prompt + testes. +0,5–1 dia para `posse_adversario`/`nota_confronto`/`arbitro_tendencia`
(precisam ler `/events/{id}/stats/` e `average_positions` no provider).

## 11. Checklist de aceite
- [ ] Ao menos 1–2 campos descritivos novos (snake_case PT) chegam à IA (no candidato e/ou contexto).
- [ ] Nenhum campo novo entra no cálculo de `prob_modelo`/edge (verificado: motor inalterado; paridade verde).
- [ ] `PROMPT_REVISOR` atualizado: lista os campos novos, permite citá-los em linguagem leiga, mantém ancoragem e proibições.
- [ ] `reviewSchema` segue barrando candidato inventado; degradação graciosa intacta.
- [ ] A IA continua devolvendo só `stance`+`nota`/`alertas`; decisão de apostar permanece no código.
- [ ] `npm test` verde.
- [ ] `docs/ROADMAP.md` / `docs/PITCH.md` atualizados (IA com sinais de confronto como texto).

## 12. Como verificar
```bash
npm test            # inclui: campos novos chegam à IA; schema barra inventado; degradação graciosa
npm run typecheck
```
Sondar a BSD para confirmar os dados-fonte (usa `BZZOIRO_API_KEY` do `.env`):
```bash
# posse de bola + árbitro do jogo (contexto da IA):
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/8287/stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j).slice(0,400)))'
# average_positions (lado de ataque) de um jogo com stats ricas (amistoso 9099):
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/9099/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(j.player_stats?.[0]?.average_positions))'
```
Inspeção manual: rodar uma análise real e conferir que o JSON enviado à IA (`reviewer.ts:80-82`) contém
os campos novos e que a explicação resultante os cita em linguagem leiga, sem jargão.
