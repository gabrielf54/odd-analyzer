# N3 — Escopo histórico (clube + seleção)

## 1. TL;DR
O escopo `"todos"` mistura jogos de **clube** e **seleção** na amostra de forma do jogador. Para a Copa,
isso **está certo**: a forma de **clube** é o melhor preditor de volume (muito mais amostra — seleção
joga pouco) e já é o **default**. Esta ficha **não é uma melhoria a implementar** — é uma **decisão a
MANTER e documentar**, para a próxima sessão **não "consertar" o que já está correto**.

## 2. Status
- **Ajuda à meta:** **Alto** — *manter* `"todos"` é o que dá amostra suficiente para o μ ser estável.
- **Pronto p/ Copa:** ✅ **Sim** — já é o default e funciona; **nada a fazer**.
- **Esforço:** **N/A** (decisão documentada; sem código a tocar).
- **Risco de calibração/paridade:** **Nenhum agora** (não muda nada). Mudar para `"selecao"` **degradaria**
  o produto (amostra ínfima), não o melhoraria.
- **Custo de dado:** $0 (usa o histórico que a BSD já entrega via `/players/{id}/stats/`).

## 3. Problema / fundamento
O μ de um mercado de jogador nasce da **forma recente** (taxa per-90 nas últimas 3/5/10 partidas,
encolhida por um prior). Quanto **mais jogos** na janela, **menos ruidosa** a taxa e mais confiável o μ.
Seleções jogam **pouquíssimo** (uma seleção faz ~10 jogos/ano contra ~50-60 do clube). Restringir a
amostra à seleria reduziria a janela a um punhado de jogos → μ instável, encolhido quase totalmente
para o prior → **pior** previsão de volume.

A doutrina do produto (confronto **produção × concessão no mesmo eixo**) **já separa naturalmente** os
dois lados: a **produção/forma** do jogador vem majoritariamente do **clube** (onde ele acumula volume),
e o **confronto** (concessão do adversário no mesmo eixo) vem da **seleção rival** que ele vai enfrentar.
Misturar clube+seleção na *forma* não viola nada — não é "média bruta", é **ancorar a produção na maior
amostra disponível** e cruzá-la com a concessão específica do oponente.

## 4. Evidência real
- **Declan Rice** tem, na sua amostra de 50 jogos, **47 jogos de clube** (`team_id 18` = Arsenal) +
  **3 de seleção** (`493` = England) — ou seja, a forma vem **majoritariamente do clube (~94%)**. Bate
  com a tabela do [README raiz §1.2](../../README.md#12-o-que-a-sondagem-provou-números-reais):
  *"Rice: 47 Arsenal + 3 England = 94% clube. O μ é forma-de-clube × concessão-de-seleção."*
- Se o escopo fosse `"selecao"`, a amostra de Rice cairia para **3 jogos** — estatisticamente **inútil**
  (o encolhimento bayesiano dominaria e o μ viraria quase o prior).
- O `/players/{id}/stats/` **não traz `league_id` no payload** ([README raiz §1.2](../../README.md#12-o-que-a-sondagem-provou-números-reais)),
  então a separação clube/seleção é feita por **`team_id`** (o time-alvo do jogador), não por liga — é
  exatamente o que `filterGamesByScope` faz.

## 5. Estado atual no código (file:line)
- `src/manual/schema.ts:20` — `ManualOddsInput.escopo_historico` aceita
  `z.enum(["todos", "selecao", "clube"]).default("todos")`. **Default = `"todos"`** (confirmado).
- `src/manual/schema.ts:79` — o valor é repassado adiante: `escopo_historico: b.escopo_historico`.
- `src/manual/analyze.ts:61` — `analyzeManual` passa `input.escopo_historico` para `playerCandidates`.
- `src/manual/analyze.ts:105,128` — `playerCandidates(... scope)` injeta `escopo_historico: scope` no
  `ctx` que vai ao provider.
- `src/model/assemble.ts:43` — `filterGamesByScope(games, scope, entityTeamId)` filtra:
  - `"todos"` → retorna todos os jogos (linha 44);
  - `"selecao"` → só jogos com `team_id === entityTeamId` (linha 46);
  - `"clube"` → só jogos com `team_id !== entityTeamId` (linha 47).
- **Default efetivo usado na Copa = `"todos"`** (o front não força outro valor; o schema default cobre).

## 6. Por que está fora de escopo (de mudança) — e quando reabrir
**Por que NÃO mudar agora:**
- **Manter `"todos"` maximiza a amostra** → μ estável (o objetivo). Mudar para `"selecao"` reduziria a
  amostra a ~3 jogos (Rice) → **inútil**, μ dominado pelo prior. Seria um **downgrade**, não upgrade.
- Não há **nada quebrado** para consertar: o comportamento atual é o desejado e está coberto por testes.
- **Sintoma a vigiar (anti-regressão):** se uma sessão futura olhar "estamos misturando clube e seleção,
  isso é um bug de população" e trocar o default para `"selecao"` → **isso está errado**, e a razão está
  aqui. A mistura é **deliberada** (forma-de-clube é o melhor preditor de volume).

**Refinamento futuro possível (NÃO agora):** *ponderar* jogos de seleção **mais** que clube (pesos, não
filtro binário), porque o **estilo** seleção difere do clube (ritmo, parceiros, esquema). Isso **pode**
ter mérito — mas **precisa ser medido (calibração) antes**. Sem evidência de que a ponderação melhora o
Brier/ECE, **não mexer**: é troca de um default que funciona por uma hipótese não provada.

**Gatilho exato para reabrir (o refinamento de ponderação):**
> A prova **forward (I7)** mostrar que o μ baseado em **forma de clube erra sistematicamente** nas
> seleções (ex.: viés consistente — o jogador rende menos volume com a seleção do que o clube previa,
> jogo após jogo, no `paper_ledger`).

Só então vale **medir** uma ponderação clube-vs-seleção (offline + forward) antes de mudar qualquer default.

## 7. Plano de validação
**Da decisão atual (manter `"todos"`):** validada **via forward (I7)** — observar no `paper_ledger`/CLV
se o μ baseado em forma de clube **acerta** nas seleções da Copa. **Critério:** se o sinal calibra
(Brier/ECE razoáveis, CLV ≥ 0) com `"todos"`, a decisão está confirmada — **não mexer**.

**Do refinamento (se o gatilho disparar):** medir a ponderação clube-vs-seleção **offline** (em jogos
de seleção recentes, já que Copa passada está vazia) — a ponderação **só entra** se melhorar Brier/ECE
vs o `"todos"` plano; depois confirmar forward. **Sem essa prova, não muda o default.**

## 8. Riscos & armadilhas
- **"Consertar" o que não está quebrado:** trocar o default para `"selecao"` por parecer "mais puro"
  → destrói a amostra. **Principal risco desta ficha.** A mistura é intencional.
- **Ponderar sem medir:** introduzir pesos clube/seleção "no olho" muda o número (money-path) **sem**
  validação → viola o princípio validação-primeiro. Só com Brier/ECE na mão.
- **`filterGamesByScope` separa por `team_id`, não por liga** (o stats não traz `league_id`): se um
  jogador trocou de clube, "clube" continua sendo "tudo que não é o time-alvo" — ok para o propósito,
  mas não confundir com filtro por competição.

## 9. Dependências
- Para o **refinamento** (se reaberto): depende do loop forward (I7) ter acumulado dados suficientes
  para detectar viés sistemático, e do protocolo de recalibração (Tier 2 / N2) para validar pesos.
- Para **manter** (estado atual): **nenhuma** — já está em produção.

## 10. Esforço
- **Agora:** **N/A** (decisão documentada; zero código).
- **Refinamento futuro (se/quando reabrir):** **Médio** — exige medição de calibração (offline + forward)
  antes de qualquer mudança de peso; não é trivial porque precisa de amostra de seleção com settle.

## 11. Checklist (de manutenção / anti-regressão)
- [ ] Default de `escopo_historico` **permanece `"todos"`** (`src/manual/schema.ts:20`) — não trocar
      para `"selecao"` sem o gatilho do §6 + validação do §7.
- [ ] `filterGamesByScope` (`src/model/assemble.ts:43`) **inalterado** salvo decisão validada.
- [ ] Se o refinamento de ponderação for aberto: evidência de viés sistemático (I7) **registrada** e
      Brier/ECE da ponderação **medidos** antes de mudar qualquer default; ROADMAP/PITCH atualizados.

## 12. Como verificar
Confirma o split clube/seleção de um jogador (prova de que a forma vem majoritariamente do clube).
Usa `BZZOIRO_API_KEY` do `.env`; troque o `PLAYER_ID` (Rice é o exemplo do README):

```bash
# Conta jogos por team_id no histórico do jogador (a forma vem do team_id dominante = clube):
node -e 'const id=process.argv[1]; fetch("https://sports.bzzoiro.com/api/v2/players/"+id+"/stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>{const g=j.stats||j.games||[]; const c={}; g.forEach(x=>{const t=x.team_id; c[t]=(c[t]||0)+1}); console.log("player",id,"total=",g.length,"por team_id:",c)})' PLAYER_ID
```

**Leitura do resultado:** um `team_id` (o clube) deve dominar (ex.: ~47 de 50 para Rice/Arsenal) e o
`team_id` da seleção aparecer pouco (~3). Isso **confirma** que `"todos"` ancora a forma no clube — a
decisão a manter. Se algum dia a seleção dominasse a amostra, revisitar a premissa.

Verificação de comportamento no código (sem rede):
```bash
# default e enum do escopo:
npm test -- manualAnalyze   # cobre o fluxo manual; o default "todos" é exercido aqui
```
