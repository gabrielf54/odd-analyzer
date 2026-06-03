# Design — Seletor de jogador (escalação provável) nos mercados de jogador

**Data:** 2026-06-03
**Status:** aprovado (brainstorming) — aguardando plano de implementação

## Problema

Na aba de mercados de jogador (SOT, finalizações, desarmes) o front não tem
interface para escolher um jogador. Hoje `_render_mercado` chama "Varrer elenco"
→ `service.analisar(..., player_ref=None)` → varre os 22 e filtra por edge/EV. Dois
defeitos:

1. **Sem picker.** Não dá para escolher um jogador (nem um time) antes de analisar.
2. **Odd única para o elenco todo.** A casa precifica odd POR jogador; aplicar uma
   linha/odd a todos vira placeholder e distorce o edge.

Além disso, em jogo pré-jogo sem lineup confirmado o `elenco()` volta vazio →
nenhum candidato, sem fallback.

## Objetivo

Substituir a varredura cega por um **seletor de 1 jogador por vez**, alimentado pela
**escalação provável** do jogo; se não houver escalação, cair para **quem jogou nos
últimos 3 jogos** do time. Mercados de partida (gols/escanteios) não mudam.

## Decisões (do brainstorming)

- **"Métricas exclusivas de jogadores"** = dados ao lado de cada nome no picker para
  ajudar a escolher (não novas métricas no modelo).
- **Seleção:** um jogador por vez → digita a odd REAL dele → analisa só ele.
- **Riqueza do picker:** barato/instantâneo (nome, posição, time). A média recente do
  mercado aparece DEPOIS de escolher o jogador.
- **Fallback:** sem escalação provável → **qualquer um que jogou** (titular ou banco)
  em qualquer dos 3 últimos jogos.
- **Layout:** dois times lado a lado (mandante | visitante), para enxergar o confronto
  inteiro. Badge marca a origem da lista.

## Fluxo

```
abre aba de mercado de jogador
  → service.escalacao_provavel(client, event_id)
  → 2 colunas (mandante | visitante), cada uma lista de jogadores selecionáveis
  → badge: "Escalação provável" | "Escalação confirmada" | "⚠ Sem escalação — últimos 3 jogos"
clica 1 jogador
  → service.media_recente_jogador(...) (1 call) → mostra "desarmes 2.1/jogo · 5 jogos"
  → inputs Linha / Odd Over / Odd Under / IA + botão "Analisar"
clica Analisar
  → service.analisar(..., player_ref=<player_id>) → run_analise (OnlyPlayer) → 1 jogador
  → tabela de candidato + (modo pré) botão paper + (modo pós) resultado real + IA
```

Mercado de partida (`nivel == "partida"`): caminho atual intacto, sem picker.

## Camada de serviço (`src/odd_analyzer/service.py`)

Funções puras, sem Streamlit, com client injetado → testáveis com fake.

### `escalacao_provavel(client, event_id) -> dict`

Forma de retorno:
```python
{
  "origem": "confirmada" | "provavel" | "ultimos3",
  "home": {"team_name": str, "team_id": str, "jogadores": [ {id, name, team_id, posicao} ]},
  "away": {"team_name": str, "team_id": str, "jogadores": [ ... ]},
}
```

Lógica:
1. `data = client.lineups(event_id)`. Se `data["lineups"]["home"|"away"]` tem `players`
   não-vazio → usa esses jogadores. `origem = "confirmada"` se
   `lineup_status == "confirmed"` (ou flag `confirmed` por lado), senão `"provavel"`.
   Cada jogador: `{id, name, team_id, posicao=p.get("position","")}` — mesmo shape que
   `BSDStatsProvider.elenco`.
2. Senão → fallback por time. Pega `home_team_id`/`away_team_id` de `client.get_event`.
   Para cada time: `client.events(team_id=..., status="finished", limit=3)` → para cada
   evento `client.event_player_stats(ev_id)` → **união** dos jogadores que aparecem
   (qualquer um que jogou; dedupe por `player_id`). `posicao` = o que vier (pode ser
   `""`). `origem = "ultimos3"`.

**Barato:** nenhuma chamada de stats por jogador no caminho da escalação provável.
(O fallback faz 3 + 3 calls de player-stats de jogo, inerente a "quem jogou".)

### `media_recente_jogador(client, event_id, market_key, player_id) -> dict`

Retorno: `{"media": float, "jogos": int}`. Uma chamada `client.player_stats(player_id)`,
agrega o `stat_field` do mercado nos jogos retornados. Só roda ao clicar num jogador
(honra "dado caro só depois de escolher"). `market_key` valida contra `MARKETS`.

### `analisar(...)` — novo parâmetro `player_ref`

Assinatura ganha `player_ref: str | None = None`, repassado direto a
`run_analise(..., player_ref=player_ref, ...)`. `run_analise` já trata player_ref via
`OnlyPlayer` (restringe o elenco a 1). Demais params inalterados. Sem player_ref num
mercado de jogador, a UI não chama `analisar` (não varre os 22).

## Front (`app/streamlit_app.py`)

`_render_mercado(j, market_key, modo)`:
- Mercado nível-jogador (`spec.nivel != "partida"`):
  1. `esc = service.escalacao_provavel(_client(), j["id"])` (try/except → aviso amigável).
  2. Badge da `origem`.
  3. Duas colunas (`st.columns(2)`): mandante e visitante. Cada coluna lista os
     jogadores como opções selecionáveis (rótulo `nome · posição`). Seleção única por
     mercado em `session_state[f"sel-{market_key}"]` guardando `player_id`+nome+time.
  4. Selecionado → `media_recente_jogador` → caption "média recente …".
  5. Inputs Linha / Odd Over / Odd Under / IA (como hoje) + "Analisar".
  6. "Analisar" → `service.analisar(..., player_ref=<id>)`. Resto (tabela, paper, IA,
     resultado real no modo pós) reaproveitado.
- Mercado de partida: bloco atual sem alteração.

A UI continua fina: só chama `service`, nunca o motor direto.

## Testes (`tests/`, fake BSDClient, offline)

- `escalacao_provavel`: lineup presente (com `players`) → origem `provavel`/`confirmada`,
  jogadores e times corretos por lado.
- `escalacao_provavel`: lineup vazio + 3 eventos finalizados com player-stats → fallback
  união (qualquer um que jogou), dedupe por id, `origem="ultimos3"`.
- `media_recente_jogador`: 1 call, média e contagem corretas para o stat do mercado.
- `analisar` com `player_ref` → restringe a 1 jogador (via OnlyPlayer); sem player_ref
  segue varredura (compat).

## Fora de escopo (YAGNI)

- Métricas novas no modelo (zona/lado, % desarmes ganhos) — depende de dado posicional,
  já documentado como norte condicionado a dado no CLAUDE.md.
- Multi-seleção de jogadores / odd compartilhada — rejeitado (distorce edge).
- Pré-carregar média recente de todos (híbrido com cache) — rejeitado por custo.
