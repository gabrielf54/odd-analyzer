# Spec — Doutrina do Produto + Roadmap WC2026 (odd-analyzer)

**Data:** 2026-06-02 · **Sessão de planejamento (2ª).** Captura o raciocínio completo deste chat para não se perder. Doutrina resumida vive no [CLAUDE.md](../../../CLAUDE.md); este doc é o porquê + o roadmap executável com portões de decisão.

---

## 1. O que é o produto (uma frase)

Para um jogo escolhido, o sistema compara a **probabilidade do nosso modelo** (calculada em código) com a **odd da casa sem margem** (de-vig) e **só sinaliza quando o modelo está claramente à frente**. A IA escreve a explicação — **nunca inventa o número**.

**Princípio inegociável:** valor = `prob_modelo > prob_justa_sem_margem`, filtrado por **EV/edge**. NUNCA por "probabilidade alta" (favoritos são bem precificados = −EV). Threshold rígido e proposital.

**Mentalidade de entrega (o diferencial):** o modelo olha o **CONFRONTO**, não a média bruta. Sinal = encaixe **oferta × concessão no mesmo eixo**. Ex.: Time A ataca pela esquerda + lateral-direito do Time B desarma muito → over desarmes do lateral. Ex.: Time A gera muitos escanteios + Time B sofre escanteios → over escanteios do Time A. Regra: `μ_base(produz) × mult_concessão(adversário no eixo) → P(evento) → vs odd de-vig`.

---

## 2. Decisões travadas nesta sessão

| Tema | Decisão |
|---|---|
| **Mercados MVP — jogador** | Chutes a gol (**SOT**) + **finalizações totais** + **desarmes** (ambos os tipos de chute; desarmes saiu de "depois" e entrou) |
| **Mercados MVP — partida** | **Gols, vitória (resultado), escanteios** |
| **Inteligência de matchup** | Tentar **direcional/zonal já no MVP** — MAS condicionado a um **spike de viabilidade de dado free** (ver §6). Fallback = concessão por-mercado (já existe p/ SOT) |
| **Validação** | **A — calibração offline** (replay de jogos passados; modelo prevê P(evento) vs realidade; Brier/log-loss/ECE). $0, sem odd |
| **Front** | Nova section **"Jogos Passados" (opção c)**: lista por jogador (previsão vs resultado real) + painel agregado de calibração no topo. **Sem PnL** (só eficácia do modelo) |
| **Arena** | Copa 2026 (forward) → depois top ligas europeias de clube |
| **Orçamento** | ~$20. **Recusado** SGO Pro $299. Gasto único recomendado: API-Football Pro $19 (stats) |
| **Primeiro a executar** | Sub-projeto #1 (validação offline), depois revisar visão-adiante por portões (§5) |

---

## 3. Estado atual (honesto)

**Motor existe e roda offline (97 testes verdes):**
- **Modelo:** NB2 (Binomial Negativa, `r=3.0`) computa `P(SOT≥k)`. Pipeline: SoT/90 → shrinkage (prior 0.4, força 12) → minutos esperados → `opponent_multiplier` → `home_away_multiplier` → `μ` → `prob_over_line(μ, linha, r=3.0)`. Funções puras. (`model/sot_model.py`, `shrinkage.py`, `adjustments.py`)
- **Valor:** de-vig multiplicativo + power; `fair_prob_over` = maior prob do over (conservador); `edge = prob_modelo − prob_devig`; `EV = prob_modelo·odd − 1`. Filtro rígido (`candidates/filtro.py`): `edge≥0.04 E ev≥0.05 E xi_confirmado E amostra≥10`, ordenado por EV.
- **IA:** só filtra + explica. Números calculados em código e passados como JSON; LLM escolhe melhor candidato, dá veredito/confiança, escreve `motivo`. Validação anti-alucinação (`ai/schema.py`): `(jogador,linha)` tem de estar no input. Fail-closed (1 retry). Modelo `anthropic/claude-sonnet-4.6` via OpenRouter, temp 0.0.
- **Backtest:** leave-one-out, sem leakage, roda **offline** do `.cache_api` (EPL 2023; over 0.5 Brier 0.173, over 1.5 Brier 0.066). `calibration.py` = Brier + reliability bins.

**Produz ZERO em produção, por 2 pregos:**
1. `app/streamlit_app.py::_taxa_fn` é **placeholder `mu=0`** → `prob_over_line` retorna 0 → todo candidato descartado.
2. `elenco=[]` passado a `analisar_jogo` → `crosswalk.match_player` retorna None → todo prop dropado antes do modelo.

**Faltam:** módulo de produção que computa SoT/90, minutos esperados, concessão do adversário e mando ao vivo (só existe dentro de `run_backtest.collect_data`); close-the-loop de CLV (`update_fechamento` existe mas ninguém chama); métricas além de Brier; recalibração para futebol internacional/sede neutra (constantes são de clube EPL).

---

## 4. O blocker das odds (verdade dura)

- **Timing:** jogos da Copa 11–28/jun, hoje 02/jun. Casas só postam player props perto do kickoff → The Odds API devolve os 72 eventos com `bookmakers` **vazio** → front mostra "Odds de SOT ainda não postadas". Odds reais ~10/jun em diante.
- **Cobertura:** mesmo no kickoff, The Odds API `player_shots_on_target` = **só 6 ligas de clube US, sem Copa, sem bet365**.
- **Pesquisa de alternativas <$20 (workflow):** **não existe fonte confirmada de odds de SOT da Copa por <$20.** OddsBlaze $29 (US, tem CLV). BALLDONTLIE FIFA tem Copa+SOT+odds mas $39.99. BetsAPI (espelho bet365) e OddsPapi (Pinnacle) = **não confirmados**, testar free key no kickoff. SGO Pro $299 = recusado.
- **Implicação:** não dá para "validar com odd real da Copa" agora → **validar o motor offline ($0)** + auto-logar odds de clube para construir histórico próprio. (Detalhe em [docs/apis/README.md](../../apis/README.md) e memória `apis-pesquisadas-odds-stats`.)

---

## 5. Roadmap — sub-projetos e PORTÕES DE DECISÃO

Programa grande → decomposto. Cada sub-projeto tem seu próprio spec→plano→execução. **A visão-adiante que o usuário pediu são os portões: o que provar antes de gastar / avançar.**

| # | Sub-projeto | Custo | Entrega |
|---|---|---|---|
| 0 | **Docs** (este spec + doutrina no CLAUDE.md) | $0 | Mentalidade fixada |
| 1 | **Validação offline** | $0 | Prova o motor (ladder §5.1) |
| 2 | **Section "Jogos Passados"** no front | $0 | Eficácia visível ao olho |
| 3 | **Wiring ao vivo + generalização multi-mercado** | $19 | Vira produto |
| 4 | **Matchup por-mercado + (spike) direcional** | $19 | Doutrina §1 virando código |
| 5 | **Overhaul do prompt da IA** | $0 | Fecha buraco onde IA burla a matemática |

**Sequência:** 0 → 1 → 2 (tudo $0) → [PORTÃO 1] → 3 → 4 → 5.

### 5.1 Sub-projeto #1 — Ladder de validação offline ($0, ordenado)

Cada degrau passa antes do próximo. Muito já está scaffolded.

1. **Pipeline correto via odd SINTÉTICA (pytest puro, sem rede).** Pega `p` verdadeiro → constrói odd justa 2-way → injeta vig conhecido (multiplicativo E power) → passa de volta por `value/devig.py`. Assert: recupera `p`; `edge≈0` e `EV≈ −m/(1+m)` quando modelo=justo; sinal/magnitude corretos ao injetar mispricing. *Gap:* repo tem `devig.py`/`ev.py` mas **nenhum teste round-trip**. Escrever primeiro — maior alavanca, custo zero. **(S)**
2. **Honestidade do modelo via CALIBRAÇÃO em replay cacheado.** Refatorar `run_backtest.py` para ler **CSV/cache estático** (sem API ao vivo) → determinístico, $0, roda em CI. Estender `calibration.py` (Brier + bins) com **log-loss, ECE, Brier skill score** vs base-rate. Barra: curva na diagonal, **ECE < ~0.05**, skill > 0, fatiado por linha/minutos/mando. **(M)**
3. **Edge via CLV (conceito + auto-log).** Agora ($0): validar de-vig/EV contra odds de fechamento reais de `football-data.co.uk` (1X2/O-U) — prova a maquinaria. Para props: **auto-logar** o fechamento via The Odds API free (6 ligas de clube) no Supabase + ligar `update_fechamento`. Proxy até ter histórico: `model_fair_prob` fica no lado +EV do fechamento de-vig? Alvo: edge >1–2% em 1.000+ obs. **(M)**
4. **Risco/ROI via Kelly fracionário Monte-Carlo (honestidade).** Paper-bet `EV>limiar`, stake 0.25–0.5× Kelly, bootstrap da ordem → distribuição de banca, **max drawdown, risco de ruína** (CIs, não ROI pontual). Guardas: out-of-sample por temporada, penalizar combos testados (mentalidade Deflated-Sharpe), walk-forward. CLV = sinal primário, ROI = confirmatório. **(M)**

### 5.2 Sub-projeto #2 — Section "Jogos Passados" (front)

- Consome os pares (previsão, resultado real) do replay do #1.
- **Por jogador:** linha por (jogador, linha, mercado) com `P(evento)` prevista, se era "oportunidade", e o resultado real (acertou/errou) — verde/vermelho.
- **Painel agregado (topo):** curva de calibração + Brier/ECE/acerto% sobre N jogos.
- **Sem PnL/CLV** (precisaria odd histórica que não temos). Só eficácia do modelo.

### 5.3 Sub-projeto #5 — Overhaul do prompt (resumo)

Arquitetura está certa (IA filtra+explica), mas tem 1 buraco estrutural:
- **Buraco:** o gate "só APOSTAR quando edge>0 E ev>0 E xi E amostra" vive **só no texto** do prompt; `schema.py` não re-checa. → **Mover o gate para Python**: passar `veredito_sugerido` + `regra_aplicada` por candidato; prompt vira *echo, não recompute*; validador rejeita se a IA **subir** o veredito (pode só rebaixar).
- **Anti-drift:** trocar parsing de texto por **OpenRouter Structured Outputs** (`response_format json_schema`, `strict:true`, `additionalProperties:false`, enums para veredito/confiança, `provider.require_parameters:true`).
- **Drift de número impossível por construção:** IA devolve `candidato_id` (enum de índices válidos), não números; código re-anexa edge/ev/prob por id. `motivo` = só prosa.
- **Confiança:** enum por rubrica derivada do código (baixa se amostra<N ou xi não confirmado), não número inventado. Adicionar "weakener" (reconheça incerteza/dados faltantes) — melhora calibração.
- **Evals:** golden-set 50–200 casos (usando `_chat` injetável) + asserts determinísticos ("nenhum número no output ausente do input", "veredito não subiu") + LLM-as-judge só na prosa.

### 5.4 PORTÕES DE DECISÃO (a visão-adiante)

- **PORTÃO 0 — após docs (agora):** usuário revisa este spec → aprova → `writing-plans` para o #1.
- **PORTÃO 1 — após #1+#2 ($0):** *Eu testo o produto* (rodo a suíte + o backtest + abro a tela "Jogos Passados") e te mostro a eficácia. **SE** calibração passa (ECE<0.05, Brier skill>0, round-trip verde) → seguimos e **compramos API-Football Pro $19** (~1 sem antes da Copa) para ligar stats reais da Copa no #3. **SE** calibração falha → conserta modelo antes de qualquer gasto.
- **PORTÃO 2 — após #3 (com os $19):** stats reais da Copa fluindo. No kickoff (~10/jun), testo se **alguma** fonte de odds (The Odds API / BetsAPI / OddsPapi free) expõe SOT da Copa. **SE sim** → rodo de-vig/EV/IA nos jogos reais da Copa (paper). **SE não** → rodo o produto nas 6 ligas de clube US (The Odds API) para validar forward enquanto a Copa não dá odd, e auto-logo props.
- **PORTÃO 3 — após paper-trade com CLV+ consistente:** só então considerar dinheiro real / SGO $299. Edge tem de estar provado.

---

## 6. Spike de viabilidade — dado direcional/zonal (gate do matchup MVP)

O usuário quer o nível direcional (esquerda × lateral-direito) já no MVP. Antes de implementar, **um spike** responde: existe de graça?
- Checar **SofaScore** (não-oficial via `soccerdata`/ScraperFC): tem ações defensivas por jogador? mapa de calor / lado?
- Checar **StatsBomb Open Data**: eventos geolocalizados (todo passe/desarme com x,y) → dá lado de ataque e zona do desarme — mas cobertura é subconjunto curado, não a Copa ao vivo.
- Checar se API-Football expõe algo de zona/lado (provável que não).
- **Resultado do spike decide:** se há dado free e estável → camada direcional no MVP. Se não → MVP usa concessão por-mercado e o direcional fica documentado como norte (não se promete o que o dado não dá).

---

## 7. Stack de dados WC2026 (mais barato)

- **Stats (pipeline) = API-Football** free agora → **Pro $19/mês ~1 sem antes** (100→7500/dia, sem cap pág.3, destrava season=2026 + lineups). Base via leave-one-out de `/fixtures/players`.
- **Validação/cross-check = FBref** (shooting básico sobreviveu ao corte Opta jan/2026; ~1 req/3s; verificar coluna SoT numa página ao vivo) + **Understat** (big-5) + **SofaScore/FotMob** (internacionais + lesão/suspensão p/ minutos) + **StatsBomb Open Data** (validar metodologia).
- **Odds = The Odds API free** só p/ prototipar de-vig e auto-logar prop-CLV de clube. **Odds da Copa = lacuna em aberto**, experimento de kickoff.
- **Ressalva:** definição de SoT (API-Football/SofaScore) pode ≠ Opta-FIFA do settlement da casa → tratar como base rate, validar antes de apostar.

---

## 8. Riscos & open questions

- **Multi-mercado** exige generalizar `sot_model` num modelo de contagem agnóstico (SOT/finalizações/desarmes/escanteios) + um modelo de partida (gols/vitória). Arquitetura nova no #3/#4.
- **Constantes EPL** (prior, mando, dispersão) provavelmente erradas p/ Copa (sede neutra) → recalibrar com stats da Copa (precisa $19).
- **`NB_DISPERSION=3.0` duplicado** em 2 arquivos → centralizar em config.
- **Settlement mismatch** SoT API-Football vs Opta-FIFA → edge ilusório possível.
- **Odds da Copa**: sem fonte confirmada <$20 — risco de o produto não rodar na Copa ao vivo com odds; mitigação = validar forward nas ligas de clube + spike de fontes não-confirmadas no kickoff.

---

## 9. Próximo passo imediato

Usuário revisa este spec. Aprovado → `writing-plans` para o **Sub-projeto #1 (ladder de validação offline)**, começando pelo teste round-trip de odd sintética.
