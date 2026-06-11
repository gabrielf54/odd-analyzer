# N2 — Prior/shrinkage por força de liga

> **Índice/estado vivo:** [`docs/CORE.md`](../../../CORE.md) (esta pasta é o detalhe da feature). Refs a `ROADMAP`/`PITCH`/`proximos-passos` abaixo são **históricas** — unificados no CORE (conteúdo no git). Ao mexer no estado, atualize o **CORE**.

## 1. TL;DR
A "forma" do jogador vem **majoritariamente do clube** (Rice: 47 jogos Arsenal + 3 England = **94%
clube**). Jogadores de seleções **fora do top-5** têm forma de ligas **fracas/heterogêneas** → mais
**ruidosa**; o prior (EPL) e a dispersão (`r=3.0`) podem não servir. **Encolher mais** (ou um prior
por força de liga) reduz esse ruído. O obstáculo: o payload **não traz `league_id`** por jogo.

## 2. Status
- **Ajuda à meta:** **Médio** (a Copa mistura jogadores de ligas muito desiguais).
- **Pronto p/ Copa:** ⏳ Só com calibração (priors alternativos em jogos de seleção) + forward.
- **Esforço:** **Médio**.
- **Risco de calibração/paridade:** **Médio** — muda o μ (encolhe diferente) → paridade + re-calibração.
- **Custo de dado:** **$0** no caminho simples (revisar `prior_strength`). Separar **por liga** custa
  **chamadas extras** (inferir liga por `team_id`), porque o `/players/{id}/stats/` **não traz `league_id`**.

## 3. Problema / fundamento (confronto × concessão × EV)
O μ começa numa **taxa por-90 encolhida** para um **prior**. O shrinkage (`shrinkRate`) é uma média
ponderada entre a taxa observada do jogador (peso = nº de jogos) e o prior (peso = `prior_strength`):
quanto **mais ruidosa** a amostra, **mais** ela deveria pesar para o prior. Hoje o prior e a força do
prior são **globais por mercado** (calibrados em EPL), independentes de **onde** o jogador joga.

Problema na Copa: a "forma" de um jogador de seleção do top-5 (EPL/LaLiga…) é estatisticamente
diferente da de um jogador cuja temporada foi numa liga **fraca ou heterogênea** (defesas mais
abertas, ritmo diferente, amostra com mais variância). Aplicar o **mesmo** encolhimento a ambos
**superestima a confiança** na forma do segundo → `prob_modelo` mais ruidosa → mais falso-positivo
(−EV). Encolher **mais** a amostra de liga fraca (ou usar um prior calibrado por força de liga)
**aproxima o μ do honesto** justamente onde o dado é pior — o que protege o EV.

## 4. Evidência real (números + file:line)
- **Priors são EPL:** `src/model/params.ts:1` ("Calibrados no backtest EPL 2023"). Por mercado em
  `MARKETS`: `sot` 0.4/12 (`src/model/markets.ts:24`), `finalizacoes` 1.2/12 (`:30`), `desarmes`
  1.3/12 (`:36`) — `prior_rate`/`prior_strength`.
- **Forma é 94% clube:** README mestre §1.2 (`docs/proximos-passos/README.md:42`) — Rice 47 Arsenal + 3 England.
- **Sem `league_id` por jogo:** `/players/{id}/stats/` **não** traz `league_id` no payload (README
  mestre §1.2, `docs/proximos-passos/README.md:42`) → separar por liga exige inferir via `team_id` →
  liga, o que **custa chamadas**.
- **O que já se ajusta por liga é a CONCESSÃO, não o prior do jogador:** `baselineFor`
  (`src/model/markets.ts:64-69`) troca o `concede_baseline` clube↔seleção pela liga **do jogo**
  (`NATIONAL_LEAGUE_IDS`, `src/model/markets.ts:61`, inclui 27 e 31). **Mas o prior do JOGADOR
  (`prior_rate`/`prior_strength`) é fixo**, não muda com a força da liga de origem dele.

## 5. Estado atual no código (file:line exatos)
- **Shrinkage:** `shrinkRate(rate, apps, priorRate, priorStrength) = (apps*rate + strength*prior) /
  (apps + strength)` (`src/model/shrinkage.ts:3-5`). Com `apps=0` retorna o prior.
- **Priors globais por mercado:** `prior_rate`/`prior_strength` em `MARKETS`
  (`src/model/markets.ts:21-58`) — **não há eixo de liga/jogador**.
- **Onde o shrink roda no fluxo de jogador:** via `playerMuFromGames` chamado em `entityRate`
  (`src/providers/stats.ts:191-193`), que recebe `market.prior_rate, market.prior_strength`. É o
  ponto onde um `prior_strength` ajustado por população entraria.
- **Baseline de concessão já comuta por liga do jogo:** `baselineFor` (`src/model/markets.ts:64`),
  usado em `src/manual/analyze.ts:114`. (Confirma que a infra de "liga do jogo" existe; falta a de
  "liga de origem do jogador".)

## 6. Proposta de implementação
Três opções, da mais cara à mais simples/segura. **Recomendar começar pela (c).**

**(a) Prior por força de liga (o ideal, o mais caro).**
Inferir a liga de cada jogo do histórico do jogador via `team_id → liga` (chamada extra, cacheável),
classificar em faixas (top-5 / médias / fracas) e usar `prior_strength` maior para amostras de liga
fraca. **Caro** (chamadas) e a inferência pode falhar → cair para o default.

**(b) Prior maior quando a incerteza é alta.**
Já existe `uncertaintyFor(n)` (`src/providers/stats.ts:21`) → `alta/media/baixa`. Escalar
`prior_strength` para cima quando `incerteza === "alta"` (poucos jogos) — encolhe mais quem tem menos
dado, sem precisar de `league_id`. Mais barato que (a), mas usa **quantidade** de jogos como proxy de
ruído, não **qualidade da liga**.

**(c) Revisar/recalibrar `prior_strength` para a população de seleção (mais simples e seguro).**
Verificar via calibração se `prior_strength=12` (EPL) é **robusto** para seleção e, se não, definir um
`prior_strength` (por mercado) **maior** para a população de seleção — possivelmente acoplado ao
roteamento de liga que `baselineFor` já faz (`NATIONAL_LEAGUE_IDS`). Sem chamadas novas, só constantes
calibradas.

**Wire (snake_case PT):** se (c) introduzir um prior por população, expor no `trace`/dossiê de forma
legível (a IA explica "como ele jogou pouco, demos menos peso à fase recente"). O contrato do
candidato não muda (`prob_modelo` etc. seguem iguais).

**Ports & Adapters / paridade:** a mudança é no **domínio** (constantes/`shrinkRate`), puro e
testável; muda o μ → re-rodar `npm test`, **re-calibrar e re-congelar golden de `test/parity/` de propósito**.

## 7. Plano de validação
- **Offline:** calibração (Brier/ECE) com **priors alternativos** em **jogos de seleção recentes**
  (ligas 31/58–67, que existem) via leave-one-out — adaptar `scripts/backtest-tilt.mts` para varrer
  alguns valores de `prior_strength` e comparar.
- **Critério de aceite:** o prior escolhido **melhora ou não piora** ECE e mantém **BrierSkill>0** na
  população de seleção, sem degradar os mercados que já prestam (sot/finalizações/desarmes).
- **Forward:** I7 confirma na Copa por `market_type`.

## 8. Riscos & armadilhas
- **`league_id` não vem fácil:** a opção (a) depende de inferência por `team_id` → **chamadas extras**
  (custo de latência, não de $) e pode falhar → fail-closed para o prior default.
- **Paridade:** muda o μ → re-freeze consciente das golden; não quebrar `test/parity/` em silêncio.
- **Over-shrink:** encolher demais mata a vantagem real de um jogador que de fato produz muito →
  calibrar a força, não chutar. Medir o trade-off (ECE vs sensibilidade) por mercado.
- **Não confundir os dois eixos de liga:** `baselineFor` já trata a liga **do jogo** (concessão);
  N2 é sobre a liga **de origem da forma do jogador** (prior). São coisas diferentes — não duplicar.

## 9. Dependências
- **I7** (loop forward) para confirmar na Copa.
- (Opção a) inferência `team_id → liga` — bloco de dado a especificar antes.
- Reuso de `uncertaintyFor` (`src/providers/stats.ts:21`) para a opção (b).

## 10. Esforço estimado
**Médio:** opção (c) ≈ 0.5–1 dia (varredura de `prior_strength` + recalibração + re-freeze). Opção (a)
≈ +1-2 dias (inferência de liga + cache + faixas). Recomenda-se (c) primeiro; (a) só se (c) não bastar.

## 11. Checklist de aceite
- [ ] Calibração com priors alternativos rodada em jogos de seleção (leave-one-out); resultado documentado.
- [ ] `prior_strength` escolhido **não piora** ECE e mantém BrierSkill>0 na população de seleção.
- [ ] Se introduzido prior por população: expor no `trace`/dossiê de forma legível (IA explica em palavras).
- [ ] `npm test` verde; golden `test/parity/` re-congeladas de propósito com nota no commit.
- [ ] `docs/ROADMAP.md` / `docs/PITCH.md` atualizados.

## 12. Como verificar
```bash
# varrer prior_strength em jogos de seleção (adaptar o script p/ varrer valores):
npx tsx scripts/backtest-tilt.mts

npm test
npm run typecheck
```
```bash
# confirmar que /players/{id}/stats/ não traz league_id por jogo:
node -e 'fetch("https://sports.bzzoiro.com/api/v2/players/PID/stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(Object.keys(j.results?.[0]??{})))'
```
