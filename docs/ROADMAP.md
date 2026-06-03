# Roadmap & Status — odd-analyzer

> **Atualizado:** 2026-06-03 · **Branch:** `feat/sub3-bsd-oficial-multimercado` (NÃO mergeada na main) · **Suíte:** 287 testes verdes · **Custo até aqui:** $0.

## TL;DR — onde estamos

Construindo o **motor multi-mercado** sobre o **BSD/Bzzoiro** (fonte oficial de stats, grátis, validada manualmente no SofaScore). O encanamento (Fase 0) e o **primeiro mercado ponta-a-ponta — escanteios (Fase 1)** estão prontos e testados.

- ✅ **A máquina foi PROVADA** com fixtures: `evento → mu → odd → de-vig → edge/EV → filtro → candidato → IA → ledger` (e2e: edge +0.094, EV +0.127).
- ⚠️ **Ainda NÃO produz contra dado VIVO do BSD** — a lógica está provada com fixture; falta plumbing de dado real (ver Follow-ups).
- ⬜ Faltam **Fases 2, 3, 4** + alguns follow-ups (abaixo).

## Produto (1 frase)

Para um jogo, compara a **probabilidade do nosso modelo** (calculada em código) com a **odd da casa sem margem** (de-vig) e só sinaliza quando o modelo está claramente à frente (+EV). A IA **explica**, nunca inventa o número. Doutrina completa: [../CLAUDE.md](../CLAUDE.md).

---

## Estado por fase

### ✅ Fase 0 — Infra (seams + contratos)
`markets.py` (6 mercados como dado) · `cache.py` (TTL + namespace) · `bsd/client.py` (11 endpoints) · `providers/` (StatsProvider/OddsProvider protocols + stubs + Fallback) · `store/` (`market_type` no schema/repo).
Commits: `6bed52c` `a0aba7f` `328b45b` `27619f6` `c082d6a`.

### ✅ Fase 1 — Escanteios ponta-a-ponta
`assemble.py` (janelas 3/5/10 + matchup) · builder (`concedido_adversario` + `market_type`) · **BSDStatsProvider** real (elenco + entity_taxa) · **BSDMatchOdds** real (over/under do `/events/{id}/odds/`) · **pipeline** agnóstico de mercado (dispatch por `kind`) · **e2e** escanteios.
Commits: `7a3a467` `05a6ac9` `8a5872c` `ff84b12` `4793cb4` `a641a52`.

### ⬜ Fase 2 — Mercados de JOGADOR (SOT · finalizações · desarmes)
Modelo-only + **ManualOdds** (cola a linha à mão) — **ZERO API de odds nova**. Slot `PropOddsProvider` fica pronto p/ feed futuro.
> **Encaixa melhor que escanteios:** `entity_taxa` p/ jogador usa `player_stats(player_id)` (endpoint **certo**) e `elenco` já devolve jogadores → **não depende do Follow-up #25**.
Tasks do plano: 15–21 (pular **15** — markets já tem os specs de jogador na Fase 0).

### ⬜ Fase 3 — Modelo de PARTIDA (vitória 1X2 + gols)
`match_model.py` (Poisson bivariado + Dixon-Coles) → `probs_1x2` + `prob_total_over`; `team_rates`.
Tasks do plano: 22–28 (pular **23** — markets já tem vitoria/gols).

### ⬜ Fase 4 — Validação + fallback + UI + extensão
Backtest por mercado + **calibração (ECE<0.05)** · **ApiFootballStatsProvider + FallbackStatsProvider** wired · religar **streamlit** · slot PropOdds documentado.
Tasks do plano: 29–35 (pular **33** — PropOdds stub já feito na Fase 0).

---

## Follow-ups / gaps abertos

Não quebram testes (fixtures), mas **bloqueiam dado REAL**:

| # | Gap | Impacto | Quando resolver |
|---|-----|---------|-----------------|
| **#25** | **Histórico de TIME p/ escanteios** (`nivel=partida`): `elenco` devolve jogadores e `entity_taxa` usa `player_stats`; precisa de `events(team_id, finished)→team_stats(event_id)` agregado + iterar **times**, não jogadores | Escanteios **não roda em dado real do BSD** até resolver | Antes de escanteios live / junto da Fase 4 |
| — | `app/streamlit_app.py` quebrado (assinatura antiga de `analisar_jogo`) | App não roda até religar (já entregava zero antes) | Fase 4 (Task 34) |
| — | `save_analise`/`get_analise` sem `market_type` | Múltiplas análises por evento (mercados diferentes) colidem na persistência | Quando persistir multi-mercado de verdade |
| — | Duplicatas de plano entre fases (tasks **7/9/15/23/33** recriam infra já feita na Fase 0) | Pular na execução (não re-implementar) | Já mapeado |

## Decisões travadas (NÃO re-litigar)

- **BSD = fonte oficial** de stats; **API-Football = fallback** (atrás de `StatsProvider`).
- **Mercados de jogador** (SOT/finalizações/desarmes): **modelo-only + entrada manual de odd**; slot `PropOddsProvider` p/ feed futuro. **Nenhuma API de odds de prop é necessária** pra construir/usar.
- **Mercados de partida** (gols/vitória/escanteios): odds do **próprio BSD** (Pinnacle/bet365/betano) p/ de-vig.
- **Odd de prop de jogador de casa BR NÃO existe < $99/mês** (4 ângulos confirmaram). Comprar feed só **DEPOIS** da Fase 4 (calibração+CLV), com **evidência** de que o modelo bate o mercado.
- **EV decide no código** (filtro `edge≥0.04, ev≥0.05, xi_confirmado, amostra≥10`); **IA só explica** (guarda anti-alucinação).
- Cadência de execução: **subagent-driven, fase a fase**, com checkpoint entre fases.

## Caminho até dinheiro real (validação-primeiro)

1. **Fases 2–4 (build)** — $0, tudo offline/fixtures.
2. **Calibração offline por mercado** (Brier/ECE/BrierSkill, ECE<0.05) + **CLV** no `paper_ledger` — $0.
3. **Com evidência:** decidir comprar **API-Football $19** (stats live, ~1 sem antes da Copa) e/ou reavaliar prop-odds.
4. **Paper-mode → dinheiro real** só com calibração boa + CLV+ consistente.

## Riscos

- **BSD indie:** cap diário oculto? → mitigado por cache agressivo + fallback API-Football + interface trocável.
- **Settlement mismatch** (def. de stat do BSD vs casa) → calibrar antes de dinheiro.
- **"Máquina provada" ≠ "modelo bom":** a calibração (Fase 4) é que diz se o sinal presta. Nada de auto-engano.
- **Timing:** odds de partida do BSD populam perto do kickoff; lineup ~1h antes.

## Como retomar (próxima sessão)

- **Spec:** [superpowers/specs/2026-06-03-sub3-bsd-oficial-multimercado-design.md](superpowers/specs/2026-06-03-sub3-bsd-oficial-multimercado-design.md)
- **Plano (35 tasks):** [superpowers/plans/2026-06-03-sub3-bsd-oficial-multimercado.md](superpowers/plans/2026-06-03-sub3-bsd-oficial-multimercado.md)
- **Dados/endpoints do BSD:** [dados-necessarios-analise.md](dados-necessarios-analise.md) · **APIs:** [apis/README.md](apis/README.md)
- **Próxima fatia:** Fase 2 (mercados de jogador) — Tasks 16–21 do plano (pular 15). Não precisa de API nova.
