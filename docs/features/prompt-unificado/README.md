# Prompt de coleta UNIFICADO — 1 prompt cobre o jogo inteiro (partida + jogador)

> **Pendente.** Ao shipar: mover a essência pro [`CORE §3`](../../CORE.md) (uma linha) e **APAGAR esta
> pasta** (regra de não-poluição do `features/`). Spec de brainstorming 2026-06-12.

## Problema

Hoje a coleta de odds usa **dois prompts** (`buildOddsPrompt(event, "jogador"|"partida", lineup)`,
`src/manual/prompt.ts`). O dono cola cada um na IA externa (**Claude no navegador**, computer-use
raspando a casa), copia o pipe de volta, cola na plataforma. Dois prompts = **duas sessões** de
navegação = a página da casa é carregada/fotografada **2×** → input (o caro do computer-use)
duplicado, e UX com dois passos.

## Objetivo

Um único prompt — chave `"tudo"` — que coleta **partida + jogador do mesmo jogo numa sessão só** e
devolve **um pipe** com tudo. UX: 1 botão "Analisar tudo", 1 caixa de colar.

## Por que é seguro (tamanho não é mais o gargalo)

- O commit `76c4141` (saída JSON→pipe) cortou ~2/3 do output. Pior caso de Copa (~22 jogadores × 5
  mercados ≈ 150-250 linhas pipe ≈ **3-4k tokens**) cabe folgado no cap de output do Claude. Partida
  soma ~12 linhas (migalha). **Truncar saiu da mesa** pós-pipe — o aviso velho do `prompt.ts:5-8` era
  da era JSON.
- Unificar é **mais barato**, não mais caro: com computer-use o gordo é o **input** (screenshots).
  Uma sessão cobrindo as duas famílias compartilha as fotos da página em vez de duplicá-las.
- **Downstream já é unificado:** `parseManualOdds` (`src/manual/schema.ts`) já aceita mercados
  misturados num só `odds[]`, e `/analise/manual` roda sobre tudo junto (linha `manual_todos`). **Só
  a COLETA estava partida em dois.**

## Desenho (Abordagem A — prompt único, saída única)

**Backend (`src/manual/prompt.ts`):**
- Nova `buildFullGamePrompt(event, lineup)`: combina os dois blocos numa ordem **partida-primeiro**
  (página principal, poucas linhas) **→ jogador** (aba "Player", cauda longa), com **um header
  `book=`** e um bloco SAÍDA que enumera os 3 formatos de linha (gols/escanteios 2 lados; vitoria sem
  linha; jogador over com alias `^`).
- Rota: `buildOddsPrompt(event, "tudo", lineup) → buildFullGamePrompt(...)`.
- **DRY:** extrair os corpos reusáveis (lista+regras de jogador; lista de mercados de partida) em
  fragmentos, compostos por `buildPlayerGroupPrompt`, `buildMatchGroupPrompt` **e** `buildFullGamePrompt`
  — para que um ajuste futuro de prompt (que o histórico mostra ser frequente) não precise ser
  replicado em 3 lugares. Os testes de frase existentes protegem contra deriva.

**Sem mudança em:** `parseManualOdds` (já despacha por `market_type` por linha), `generateOddsPrompt`
e endpoint `/prompt` (passam a chave reta; `promptQuery.market` é `z.string()`), money-path, gate de
paridade.

**Frontend (repo `odd-analyzer-frontend`, fora deste trabalho):** trocar os 2 botões/caixas por 1
botão "Analisar tudo" + 1 caixa. O parser de pipe→JSON provavelmente já lê os dois formatos (hoje
cola ambos); confirmar que aceita o blob misturado.

## Fora de escopo (YAGNI)

- Blocos delimitados na saída (`--- PARTIDA ---`): `market_type` já delimita cada linha.
- Manter as chaves antigas `"jogador"`/`"partida"`/individuais: ficam (compat); `"tudo"` é o caminho novo.

## Teste

`test/manualPrompt.test.ts`: `buildOddsPrompt(event, "tudo", lineup)` contém os 8 market_types
(sot/finalizacoes/desarmes/faltas/passes/gols/escanteios/vitoria), a lista de jogadores, **um único**
`book=`, `odd_under` (totais de partida), o alias `^`, a regra de corte `odd ≥ 10`, e nada de JSON.
Os testes de `"jogador"`/`"partida"` seguem verdes (guarda de deriva da extração de fragmentos).
