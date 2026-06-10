# Melhorias na análise manual — titularidade, posição, IA ancorada, escopo e concessão por posição

**Data:** 2026-06-10 · **Status:** aprovado pelo dono (conversa de 10/06)
**Origem:** análise investigativa E2E dos jogos England×Costa Rica (event 9099) e Portugal×Nigeria (event 206719) com odds bet365 reais. Saídas de referência: `tmp-out-england.json`, `tmp-out-portugal.json` (raiz, temporários).

## Problema (o que o E2E provou)

1. **Pré-lineup, o corte "titular" passa todo mundo.** `lineup_status: "predicted"` → `xiIds()` vazio → `xi_confirmado=true` para todos (`src/providers/stats.ts:109`). Caso concreto: Ndidi SOT 1+ @6.0 aprovado **e recomendado** com `minutos_esperados=31` (reserva). Decisão do dono: **não remover** ninguém (pode virar titular na lineup oficial) — sinalizar melhor.
2. **IA infere posição por conhecimento de mundo.** O candidato não carrega `posicao`; a IA escreveu "Rice é volante", "Saka é ponta" sem dado. Acertou aqui; vai errar em jogador obscuro.
3. **IA alucinou alerta.** "Costa Rica defende bem fora de casa" — não derivável do JSON (contradiz `concedido_adversario: 17.0`).
4. **`escopo_historico` hardcoded "todos"** na rota manual (`src/manual/analyze.ts`), sem escolha — o backtest nacional indicou só-seleção > todos.
5. **Matchup é só por-mercado no nível time.** O exemplo canônico do PITCH (produção × concessão *no mesmo eixo e posição*) não usa posição. Dado direcional/zonal NÃO existe na BSD; **concessão por posição existe** (eventPlayerStats + `player(id).position`, mesmo namespace de stats — verificado em 10/06).

## Decisões do dono (10/06)

- Estrela ⭐ só em candidato **sem risco de minutos**; com risco continua listado com selo.
- Concessão por posição **entra no money-path já** (com guarda-corpo de validação, abaixo).
- Front (repo `odd-analyzer-frontend`) atualizado junto.
- Campo neutro: **fora de escopo** agora.

## Design

### 1. Titularidade (meio-termo, ninguém some)

- Novo campo no fio (candidato): `titularidade: "confirmado" | "provavel" | "desconhecido"`.
  - `confirmado` = lineup confirmado e jogador no XI.
  - `provavel` = lineup `predicted` e jogador na lista prevista.
  - `desconhecido` = sem lineup utilizável (squad veio de últimos-3-jogos etc.).
- Novo campo: `alerta_minutos: boolean` = `minutos_esperados < 60`.
- `xi_confirmado` **permanece** (compat com front/DB). Corte "titular" do filtro **não muda** (segue cortando só quando lineup confirmado exclui o jogador).
- **Estrela:** a ordem do `rankCandidates` não muda e ninguém é removido. `recomendado=true` vai pro **primeiro candidato da ordem com `alerta_minutos=false`**; se todos tiverem alerta, o primeiro da ordem leva a estrela (com o selo visível).

### 2. Posição no dossiê

`squad()` já carrega `posicao` (G/D/M/F, da lineup BSD). Threading: `manual/analyze.ts` → `buildCandidate` → campo `posicao` no fio. A IA revisora recebe o candidato inteiro — passa a ver a posição real.

### 3. Prompt revisor ancorado (anti-alucinação)

Acrescentar ao `PROMPT_REVISOR` (`src/ai/reviewer.ts`):
- Posição do jogador: usar SOMENTE o campo `posicao` (G=goleiro, D=defensor, M=meio-campo, F=atacante). Proibido inferir função além disso.
- Afirmações sobre time/jogador: SOMENTE se deriváveis de campo recebido (`concedido_adversario`, `concedido_posicao`, `minutos_esperados`, `titularidade`, `amostra_jogos`, `incerteza`). Proibido conhecimento externo ("defende bem fora de casa", "está em má fase", "jogo sem importância").
- Quando `titularidade != "confirmado"` ou `alerta_minutos=true`, o risco de banco/substituição é alerta prioritário.

### 4. `escopo_historico` na rota manual

Body de `/analise/manual` aceita opcional `escopo_historico: "todos" | "selecao" | "clube"` (default `"todos"` = hoje). `parseManualOdds` valida; `analyzeManual` repassa no `ctx`.

### 5. Concessão por posição — money-path com guarda-corpo

**Conceito:** a taxa per-90 do jogador já encode "volante desarma mais". O que falta: **este adversário concede desproporcionalmente àquela posição?**

- **Baseline medido (uma vez, hardcoded):** script one-off varre ~100 jogos de seleção finalizados (ligas 58–62, 64–67, 31) e mede a participação típica de cada posição (D/M/F) no total concedido, por mercado (desarmes, SOT, finalizações). Resultado entra em `src/model/params.ts` como constantes datadas (mesmo padrão do `concede_baseline_nacional`). Goleiro fica fora (G→tilt 1.0).
- **Tilt no provider:** para o adversário, últimos 10 jogos finalizados → `eventPlayerStats` de quem jogou CONTRA ele → posição via `player(player_id).position` (cache eterno) → `share_adv[pos]`. Então:
  - `tilt = clamp(share_adv[pos] / share_baseline[pos], 0.85, 1.20)`
  - `oppMult_final = clamp(oppMult_atual × tilt, 0.7, 1.4)` (clamp externo de hoje preservado)
- **Fail-closed:** amostra posicional insuficiente (menos de 5 jogos com player-stats, ou share_baseline ausente p/ a posição) → `tilt = 1.0` = comportamento atual exato.
- **Funções puras intactas:** `playerMuFromGames`/`assembleMu` não mudam (tilt entra no insumo `oppMult` calculado no provider) → **gate de paridade segue verde**.
- **Mini-backtest obrigatório (guarda-corpo da doutrina):** replay de ≥200 jogador-jogos de seleção (recorte anti-espiada: prediz jogo N usando só jogos < N), Brier/ECE **com vs. sem** tilt, usando `src/backtest/calibration.ts`. **Critério de ligar por default:** Brier e ECE não degradam (tolerância 5% relativa). Se degradar → tilt sai do default (constante `POSITIONAL_TILT_ENABLED=false`) e os números medidos vão pro ROADMAP.
- **Novo campo no fio:** `concedido_posicao: string | null` (ex.: `"7.2/jogo a meio-campistas (1.18× o típico)"`) — alimenta dossiê e IA.

### 6. Front (`odd-analyzer-frontend`)

- `lib/types.ts::Candidate` += `titularidade`, `alerta_minutos`, `posicao`, `concedido_posicao`.
- Badge de titularidade: `provavel`+`alerta_minutos` → "escalação prevista — pode começar no banco" (tom warn); `desconhecido` → "sem escalação — confirme antes". Em `CandidatesByPlayer`, `CandidatesTable`, `RecommendationCard`.
- `RecommendationCard`: se a recomendada tiver `alerta_minutos`, aviso destacado.
- Posição (G/D/M/F traduzida) visível no card do jogador.

### 7. Docs

ROADMAP.md (estado, números do mini-backtest, contagem de testes) e PITCH.md (linguagem leiga: selo de banco; "agora o confronto enxerga a POSIÇÃO") atualizados no mesmo trabalho.

## Erros e bordas

- BSD fora do ar no cálculo do tilt → tilt 1.0 (nunca bloqueia análise).
- Posição ausente/desconhecida do jogador-alvo → tilt 1.0.
- `escopo_historico` inválido no body → 400 (Zod).
- `titularidade` nunca derruba candidato sozinha — só sinaliza e move a estrela.

## Testes

- TDD nos dois repos (Vitest). Backend: rank (estrela pula alerta_minutos; todos-com-alerta), titularidade tri-state, schema (escopo inválido), tilt (clamp, fail-closed, share), prompt (regras presentes), candidato com posicao/concedido_posicao. Front: render de badges (se infra de teste de componente existir; senão, helpers puros testados).
- Gate de paridade (`test/parity/`) intocado e verde.

## Fora de escopo

Campo neutro · mercados de partida · dado direcional/zonal (não existe na BSD) · automação de coleta de odds.
