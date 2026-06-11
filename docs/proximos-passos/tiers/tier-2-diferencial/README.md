# 🟢 Tier 2 — diferencial / mais oportunidades (só LIGAR com prova forward acumulada)

> **Regra de ouro deste tier:** estas fichas **mudam o número** (μ → `prob_modelo`) **ou
> adicionam mercados novos**. Por isso **NENHUMA entra no money-path sem passar pela validação**
> da sua própria ficha. E — diferente dos Tiers 0/1 — a **maioria só pode ser validada FORWARD**,
> na própria Copa, porque **as Copas passadas não têm o dado detalhado** (BSD entrega `/player-stats/`
> e `/stats/` **vazios** para 2018/2022 — ver veredito no README mestre, §1.2). Sem Brier/ECE
> offline na população Copa, a régua é o **loop forward** (I7) + CLV.

---

## Por que este tier é "perigoso" (e empolgante)

- **Tier 0** = pré-requisitos (não mexem no número; destravam medir).
- **Tier 1** = precisão segura (melhora a comparação/explicação **sem recalibrar** o número).
- **Tier 2 (este)** = o **diferencial competitivo** do produto e a porta para **mais oportunidades**
  — mas cada item ou **altera o μ** (e portanto exige re-calibração + re-freeze consciente do
  **gate de paridade 1e-9**) ou **abre um mercado** que precisa de baseline + calibração próprios.

O alerta concreto está cravado no código: o **tilt posicional cru** (bucket D/M/F) foi medido e
**DESLIGADO** porque **piorou a calibração** — `src/model/params.ts:16-21` documenta o backtest
de 2026-06-10 (`scripts/backtest-tilt.mts`, n=201/mercado, over 1.5):

| Mercado | Δ Brier | Δ ECE | Veredito (critério ≤ +5% rel. em ambos) |
|---|---|---|---|
| desarmes | +1.1% | **+10.1%** | ❌ FALHOU (ECE) |
| sot | +0.2% | **+20.0%** | ❌ FALHOU (ECE) |
| finalizacoes | −2.2% | **−13.1%** | ✅ melhorou (candidato a flag por-mercado) |

**Lição que governa todo o Tier 2:** "olhar o confronto" no formato **certo** (oferta × concessão
no mesmo eixo) é o norte do produto, mas **feito de forma crua/ruidosa, ele DESTRÓI a calibração e
queima dinheiro**. Antes de ligar qualquer um destes com dinheiro real, é preciso: **estimador
suave** (shrinkage + clamp apertado) + **gate por-mercado** (ligar só onde leave-one-out mostra
ECE↓ e BrierSkill>0) + **confirmação forward**.

---

## As 6 fichas deste tier

| Ficha | O que muda | Toca o número? (paridade) | Validável offline hoje? |
|---|---|---|---|
| **[I3 — Novos mercados de contagem](I3-novos-mercados-contagem.md)** | Adiciona mercados (cross, dribles, faltas, duelos, interceptações) reusando o motor | Sim (μ novo por mercado) | Parcial (amistosos/eliminatórias recentes) + forward |
| **[I9 — Faltas, passes e defesas de goleiro](I9-mercados-faltas-passes-defesas.md)** | Aplica a I3 a 3 mercados pedidos. Faltas = só config. Defesas = **2 patches de motor** (filtro de posição GK + eixo de produção invertido) | Sim (μ novo por mercado; patch do goleiro é aditivo) | Parcial (amistosos/eliminatórias recentes) + forward |
| **[I2 — Matchup direcional dentro do μ](I2-matchup-direcional.md)** | Multiplicador **direcional** (lado de ataque × flanco do defensor) no μ — **o diferencial #1** | **Sim (alto risco)** | Não na Copa; harness de tilt + forward |
| **[N5 — Mismatch / posse](N5-mismatch-posse.md)** | Fator de posse (favorito × zebra) — começa como **texto** p/ IA, depois μ | Texto: não · μ: sim | Parcial (leave-one-out de desarme) + forward |
| **[N2 — Prior/shrinkage por força de liga](N2-prior-por-forca-de-liga.md)** | Encolher mais a forma de seleções fracas/heterogêneas | Sim (μ) | Parcial (jogos de seleção recentes) + forward |
| **[I6 — Segunda chamada de IA](I6-segunda-chamada-ia.md)** | IA propõe hipótese de confronto / veto adversarial — **o código continua decidindo** | **Não** (número fica no código) | Comparação de decisões em backtest/forward |

> **I6 é a exceção:** não mexe no número (sem paridade), só na **geração/veto**. Mesmo assim tem
> que **medir utilidade** (reduz falso-positivo sem matar valor?) e respeitar o princípio: **a IA
> nunca seleciona por feeling** — propõe, o código calcula o edge e decide.

---

## Ordem sugerida de ataque

1. **I3 (1 mercado-piloto)** — maior retorno por menor risco: o motor já é genérico; basta
   **config + baseline + calibração** de UM mercado de confronto limpo (sugestão: **dribles** ou
   **faltas**). Ganha-se cobertura de oportunidade sem mexer no estimador.
   - **I9** é o caminho concreto dos 3 mercados pedidos (faltas, passes, defesas). Ordem **dentro**
     da I9: **faltas** (só config, melhor cobertura) → **defesas** (vale os 2 patches de motor) →
     **passes** (só se a casa precificar; senão, diagnóstico). Faltas é o piloto natural da I3.
2. **N5 fase (a)** — fator de posse **como texto para a IA** (I5): seguro (fora do money-path),
   melhora a explicação e prepara o terreno para a fase (b).
3. **I6 (b) — veto adversarial** — barato (+chamadas LLM irrisórias), pode **reduzir falso-positivo**
   sem tocar no número.
4. **N2** — revisar via calibração se `prior_strength=12` é robusto para seleção; talvez prior maior.
5. **I2 — o diferencial #1**, deixado por último de propósito: é **o mais complexo e o de maior
   risco de paridade/ECE** (o tilt cru já falhou). Só vale a pena depois que o **loop forward está
   acumulando dados** para confirmar o estimador suave.

---

## Dependências (todas)

- **Todas dependem do [Tier 0 / I7 (loop forward + paper_ledger + CLV)](../tier-0-pre-requisitos/I7-loop-forward-paper-ledger-clv.md)**
  para serem **mensuráveis** — sem o ledger gravando e o settle preenchendo `resultado`, não há
  como dizer se a mudança ajudou ou piorou na população Copa.
- **I2 / N5(b) / N2** dependem ainda de **N1 (lineup confirmado)** para que o subconjunto apostado
  seja honesto, e tocam o **gate de paridade** (`test/parity/`): mudança de μ exige re-rodar `npm test`,
  re-calibrar e **re-congelar as golden de propósito**, com nota no commit.
- **I3** depende de **medir baselines** (`scripts/measure-positional-baseline.mts` como molde) e de
  **cobertura da casa** (a bet365 precifica o prop?).

---

## Critério para LIGAR qualquer item deste tier com dinheiro real

Um item de Tier 2 só vira money-path quando **TODOS** valem:

1. **Calibração não piora** — offline (onde houver dado: amistosos/eliminatórias) **e**, obrigatório,
   **forward na Copa**: ECE não sobe (idealmente cai) e **BrierSkill > 0** no(s) mercado(s) afetado(s).
2. **CLV ≥ 0** acumulado no(s) mercado(s) afetado(s) (não estamos comprando pior que o fechamento).
3. **Gate de paridade re-congelado de propósito** (se mudou o número): golden de `test/parity/`
   regeradas com nota explicando a mudança de μ; `npm test` verde.
4. **Flag por-mercado**: ligar só onde a evidência aponta (como finalizações reagiu bem ao tilt),
   nunca "ligar para todos" porque "faz sentido".

**Enquanto não:** o item fica disponível como **sinal/diagnóstico** (texto para a IA, números no
drawer), **sem** entrar no veredito de aposta. Fé não medida não vira dinheiro.
