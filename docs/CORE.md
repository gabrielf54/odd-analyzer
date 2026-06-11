# CORE — O Cérebro do odd-analyzer

> **ESTE É O DOCUMENTO VIVO ÚNICO.** Objetivo + doutrina + features que existem + próximas
> features (Copa / pós-Copa) + o que NÃO re-tentar. **Atualize-o a CADA feature** (estado,
> veredito, escopo). Regras de **código/engenharia** ficam no [`CLAUDE.md`](../CLAUDE.md);
> **referência de dado/custo** em [`docs/apis/`](apis/). Detalhe de cada feature **pendente** vive em
> [`docs/features/`](features/) (uma pasta por feature) — **a pasta é APAGADA quando a feature shipa**
> (a essência sobe pra §3 e o git guarda o detalhe). Ver a regra de não-poluição no `CLAUDE.md`.
>
> **Atualizado:** 2026-06-11 · **Suíte:** 281 testes Vitest verdes · **Custo até aqui:** $0 ·
> **Arena ativa:** Copa do Mundo 2026 (seleções), abriu 2026-06-11.

---

## 1. Objetivo & doutrina (inegociável)

**Em uma frase:** para um jogo com odds, o sistema compara a **probabilidade do nosso modelo**
(calculada em **código**) com a **odd da casa sem a margem** (de-vig) e **só sinaliza quando o
modelo está claramente à frente** — e só em mercado/linha **validado na população do jogo**. A
IA escreve a explicação; **nunca inventa o número**.

1. **Valor = `prob_modelo > prob_devig`** (EV/edge positivo). **NUNCA** filtrar por "probabilidade
   alta" — selecionar favoritos é −EV sistemático, **proibido**.
2. **A IA explica e julga; NÃO calcula número.** O número vem do código (`model/`/`value/`).
3. **Validação-primeiro, sem auto-engano:** calibração offline (Brier/ECE/leave-one-out) → CLV
   forward → só então vira aposta de valor recomendada. Ideia que não dá pra validar **não entra
   no money-path**.
4. **Poucas oportunidades fortes > muitas fracas.** Se não há aposta de valor no jogo, o honesto é
   **dizer que não tem** — não forçar.
5. **Gate de paridade 1e-9** (`test/parity/`): mudança no money-path não quebra as golden sem
   re-congelar de propósito. **Não quebrar `npm test`.**

**Mentalidade de análise — o diferencial:** o modelo **não olha média bruta, olha o CONFRONTO**.
Todo sinal nasce do encaixe **oferta × concessão no mesmo eixo**:
`μ_base(quem produz a ação) × multiplicador_concessão(adversário no mesmo eixo) → P(evento) →
compara com odd de-vig`. Ex.: time que ataca pela direita + lateral-direito adversário que desarma
muito → over desarmes daquele lateral tem valor.

**Arena:** Copa 2026 (validação forward ao vivo) → depois **ligas de clube** (ver §4 pós-Copa).
**Custo:** ~$20; só o dado BSD já assinado. Não pagar fonte cara.

## 2. Como funciona (money-path, 1 parágrafo)

Forma do jogador (per90, janela 3/5/10 ponderada por minutos) → **encolhimento** bayesiano p/ a
média → **× multiplicador de concessão** do adversário (e mando) → **μ** → **NB2** dá P(X≥linha)
para contagem (sot/finalizações/desarmes/escanteios); gols/1x2 usam Poisson de partida → **de-vig**
tira a margem da odd → **edge & EV** → cortes (edge≥0.04, ev≥0.05, amostra≥10, titular) → **ranking**
por risco com a ⭐ no melhor **pronto** (titular confirmado + mercado/linha validado na população).
Tudo são **funções puras** testadas; a IA entra uma vez no fim, só pra explicar/julgar. Mapa de
arquivos (file:line) no [`CLAUDE.md`](../CLAUDE.md).

## 3. Features que EXISTEM hoje (estado)

### 3.1 Mercados & validação CIENTE DE POPULAÇÃO
`validated_lines` é mapa `{selecao?, clube?}` roteado auto pela liga (`populacaoFor`: seleção =
`NATIONAL_LEAGUE_IDS` {27,31,58-67}; resto/desconhecida = clube). Só **(mercado, população, linha)
validado** ganha a ⭐. **Anti-lock-in:** apertar a seleção não trava o clube.

| Mercado | Seleção (Copa, ATIVO) | Clube (pós-Copa) | Veredito-chave |
|---|---|---|---|
| **finalizações** | todas as linhas ✅ | todas as linhas ✅ | transfere limpo (BrierSkill +0.119/+0.088/+0.084 em 0.5/1.5/2.5; seleção n=2071) |
| **chutes a gol (sot)** | **só 0.5** ✅ | todas ✅ (legado, a re-confirmar) | seleção: 1.5 = **−0.047**, 2.5 = **−0.272** (chuta a gol pouco) → só 1+ |
| **desarmes** | 0.5/1.5 ✅ | **ausente** (a medir) | via decomposição `μ_ganhos = μ_tentativas × aproveitamento(won/total)`; casa paga `won_tackle`; BrierSkill +0.085/+0.028 (R=2.0). **2.5 morto** |
| **faltas** | **só 0.5** ✅ | a medir (pós-Copa) | comete `fouls` × adversário provoca (`was_fouled`, via `concede_field`); calib n=1816: over 0.5 BrierSkill **+0.034** (R=2.5) → ⭐; 1.5/2.5 negativos → analisadas, sem ⭐ |
| **gols / vitória / escanteios** | em validação | em validação | mercados de PARTIDA não calibraram; sem ⭐ |

Graduação **gradual por (mercado, população, linha)** conforme calibração/forward provar. Config:
`src/model/markets.ts`. O resultado carrega badge `populacao`/`populacao_motivo` (texto, fora do
número).

### 3.2 Pipeline & validação que já roda
- **Análise manual** (`/analise/manual`): cola odds → cobre todos os mercados → ranqueia por risco
  (`seguro/moderado/tiro_longo`) com ⭐ no melhor pronto → **IA revisora** (veto/ressalva/concorda
  por candidato, ancorada nos campos do dossiê, degrada graciosa se a IA falhar).
- **Gate de lineup (N1):** ⭐ exige `titularidade="confirmado"`; pré-escalação → `pendente_lineup`
  (UI: "análise provisória, aguarde ~1h antes"). `lineup_status` da Copa: `predicted`→`confirmed`.
- **Loop forward (I7) LIGADO:** `analyzeManual` grava `paper_ledger` (edge>0, com `player_id`);
  CLIs `settle` (liquida pelo resultado real; desarme por `won_tackle`), `report` (Brier/ECE/CLV por
  mercado), `snapshotClosing`. **É o que valida a seleção AO VIVO** (a calib offline foi em AFCON/
  amistoso, não na Copa).
- **Sinais de contexto p/ a IA (texto, fora do número):** `forma_tendencia` (alta/queda/estável) e
  `posse_adversario` (% posse do rival, com orientação por-mercado). `populacao_motivo` (selo).
- **Persistência:** Supabase — `odds` (fonte de verdade das odds), `analises` (resultado completo
  por jogo), `paper_ledger` (apostas-papel + CLV), `jogadores_crosswalk`.
- **Stack:** Node/TS (raiz, `src/`+`test/`), Express :3001, front Next em repo separado. Ports &
  Adapters; motor são funções puras; gate de paridade protege os números.

## 4. Próximas features

> Detalhe de cada uma em [`docs/features/<...>/`](features/). Ordem = valor.

### 🔴 DURANTE a Copa (população seleção)
| # | Feature | Por que na Copa | Detalhe |
|---|---|---|---|
| ① | **Forward (RODAR)** | não é feature nova — é OPERAR. Confirma a seleção ao vivo (calib foi em AFCON, não Copa) e pode regraduar sot 1.5. **Ação #1 hoje.** | já no Tier 0 |
| ② | **N5 — mismatch/posse** | fase de grupos = jogos MUITO desiguais; favorito massacra → afeta os props direto | [`features/durante-copa/N5-mismatch-posse`](features/durante-copa/N5-mismatch-posse/) |
| ③ | **I3 — novos mercados de contagem** | **faltas SHIPOU** (validou over 0.5 seleção, §3.1); **defesas adiada** (reprovou calib → catálogo abaixo); leque restante (cross/dribles/duelos/intercept) segue candidato; reusa o motor | [`features/durante-copa/I3-novos-mercados-contagem`](features/durante-copa/I3-novos-mercados-contagem/) |
| ④ | **N2 — prior por força de liga** | forma de seleção fraca é ruidosa → aperta a precisão nos times menores | [`features/durante-copa/N2-prior-forca-liga`](features/durante-copa/N2-prior-forca-liga/) |
| ⑤ | **I6 — 2ª chamada de IA** (promotor × cético) | IA propõe hipótese, código decide; melhora explicação (fora do número) | [`features/durante-copa/I6-segunda-ia`](features/durante-copa/I6-segunda-ia/) |
| ⑥ | **arbitro_tendencia** (resto do I5) | árbitro apita muito/pouco → contexto p/ a IA (texto) | [`features/durante-copa/arbitro-tendencia`](features/durante-copa/arbitro-tendencia/) |

### 🟢 PÓS-Copa (população clube)
| Feature | O quê | Detalhe |
|---|---|---|
| **Calibrar clube** | re-confirmar sot/finalizações + medir desarme na população de clube → preenche `validated_lines.clube`. **Destrava usar o produto nas ligas nacionais.** | [`features/pos-copa/calibrar-clube`](features/pos-copa/calibrar-clube/) |

**Backlog de re-calibração ("outra maneira"):** os `(mercado, linha, população)` que **reprovaram
a calibração ou não foram calibrados** (defesas, SOT 1.5/2.5 seleção, faltas 1.5/2.5, gols/vitória/
escanteios, desarme/sot/fin no clube) ficam catalogados em
[`features/mercados-nao-validados`](features/mercados-nao-validados/) — cada um com o **porquê** e a
**hipótese de re-calibrar de outra maneira**. É backlog de ação; o estado vivo continua aqui (§3.1)
e o que está morto de vez no §5.

## 5. Cemitério — NÃO re-tentar (sem perder o aprendizado)

| Item | Por que está morto | Quando reviver |
|---|---|---|
| **I2 — matchup direcional** (lado de ataque × posição) | BSD **não tem** `average_positions`/`shotmap`/lado de ataque (sonda 2026-06-11); `position` só G/D/M/F | só com fonte posicional **paga** (fora do orçamento) |
| **nota_confronto / lado de ataque** | mesma causa do I2 | idem |
| **I4 — xG/xA no μ** | `expected_goals` vem **NULL** em seleção | só se a Copa ao vivo trouxer xG preenchido |
| **N4 — odds automáticas BSD** | **descartado pelo dono**; BSD só dá mercado de partida não recomendável, zero player prop | — |
| **SOT over 1.5 / 2.5 na SELEÇÃO** | BrierSkill negativo (seleção chuta a gol pouco) | forward na Copa pode regraduar; **no CLUBE já valem** |
| **desarme over 2.5** | robustamente morto (18 combinações R×k, BrierSkill<0; evento raro) | só observação forward |
| **`won_tackle` direto (sem decompor)** | reprovou (ganhar é alta-variância) | não reverter — usar a decomposição |
| **tilt posicional** | degradou ECE em 2 dos 3 mercados | candidato só p/ finalizações, com re-teste |
| **Calibrar na Copa LITERAL passada** | seasons 2018/2022 têm player-stats **VAZIO** na BSD | impossível offline → só forward |
| **arbitro_tendencia** (sinal de árbitro p/ IA) | BSD não tem filtro `/events/?referee_id=` (param ignorado, listagem traz `referee_id=null` — spike 2026-06-11); agregar histórico do árbitro = varrer N eventos um a um, caro demais p/ um sinal de texto | só com fonte de **perfil de árbitro** pronta |

## 6. Glossário leigo (o dono não lê código)

- **Calibração:** detector de mentira do modelo (homem do tempo: disse 70%, choveu ~70%?). Feita
  ANTES de arriscar — por isso vem primeiro.
- **CLV forward:** "comprei antes do preço subir". Bater a odd de fechamento = bom de verdade. Só dá
  pra medir ao vivo, daqui pra frente.
- **Lineup:** os 11 confirmados (sai ~1h antes). Não recomendar quem pode ficar no banco.
- **De-vig:** tirar o lucro embutido na odd pra achar a probabilidade "justa" da casa.
- **Edge/EV:** tamanho da vantagem / quanto se ganha por R$1 no longo prazo. Só aposta com os dois +.
- **Brier/ECE/BrierSkill:** notas da prova de calibração (menor Brier/ECE = melhor; BrierSkill>0 =
  melhor que chutar a média).
- **Shift de população:** calibrar num grupo (seleção) e usar noutro (clube) — re-medir no grupo
  certo. É o motivo da **validação ciente de população**.

---
*Histórico detalhado (specs/planos de features já feitas) foi removido do `docs/` — está no git.
Referência de APIs/dado em [`docs/apis/`](apis/).*
