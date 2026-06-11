# N5 — Mismatch / posse (favorito × zebra)

> **Índice/estado vivo:** [`docs/CORE.md`](../../../CORE.md) (esta pasta é o detalhe da feature). Refs a `ROADMAP`/`PITCH`/`proximos-passos` abaixo são **históricas** — unificados no CORE (conteúdo no git). Ao mexer no estado, atualize o **CORE**.

## 1. TL;DR
A Copa tem jogos **muito desiguais**. **Posse determina oportunidade**: você desarma quando **não**
tem a bola. O favorito que domina a posse **desarma menos e finaliza mais**; a zebra **desarma mais**.
O `oppMult` por-mercado captura parte disso, mas a interação **posse × desarme** é não-linear e
**não está modelada**. Começar como **texto para a IA**; depois, se calibrar, como **fator no μ**.

## 2. Status
- **Ajuda à meta:** **Médio** (na Copa, jogos desiguais são a regra na fase de grupos).
- **Pronto p/ Copa:** ✅ Fase (a) texto **FEITA** — `posse_adversario` vai no candidato (`src/providers/stats.ts` `teamPossession`) e o `PROMPT_REVISOR` lê por-mercado (rival domina bola → menos finalização, mais desarme). Ver CORE §3.2. ⏳ Fase (b) μ: **adiada** (risco de dupla-contagem com `oppMult`) — só com calibração + forward.
- **Esforço:** **Médio**.
- **Risco de calibração/paridade:** Fase (a) **Baixo** (texto, fora do money-path). Fase (b) **Médio-Alto**
  (muda o μ → paridade + risco de **dupla contagem** com o `oppMult`).
- **Custo de dado:** **$0** (`/stats/` já traz `ball_possession`, `dangerous_attack`, `final_third_entries`).

## 3. Problema / fundamento (confronto × concessão × EV)
O encaixe oferta × concessão assume **oportunidade simétrica**, mas a **posse esperada** distorce o
**denominador de oportunidade** de cada eixo:

- **Desarmes:** só se desarma **sem a bola**. Um meio-campista de uma seleção que vai **dominar a
  posse** (favorito esmagador) terá **menos** chances de desarme do que a média histórica dele sugere
  — e vice-versa para o jogador da zebra. É uma **não-linearidade** que o `oppMult` (que só diz
  "o adversário concede X desarmes") **não** captura: ele mede a concessão **do adversário**, não o
  **tempo sem a bola** do **nosso** jogador.
- **SOT / finalizações:** mais posse esperada → mais volume ofensivo → **mais** chutes do lado do favorito.

Ou seja: em jogos de **mismatch**, o μ de desarme do favorito está **inflado** e o de finalização
**subestimado** (e o oposto na zebra). Corrigir isso afia o `prob_modelo` exatamente onde a Copa mais
produz jogos assim → mais EV real, menos falso-positivo de desarme em favoritos.

## 4. Evidência real (números + file:line)
- **`/stats/` traz posse e proxies de domínio:** a sondagem trouxe `ball_possession` (England **81%**
  no amistoso 9099 contra adversário fraco), além de `dangerous_attack` e `final_third_entries`
  (proxies de domínio territorial). São lidos do mesmo endpoint que `eventStats` já usa
  (`src/providers/stats.ts:61`, `:249`).
- **Proxy de força já calculado, mas não usado nos props de jogador:** `teamRates`
  (`src/providers/stats.ts:275-295`) computa **gols a favor/contra** (`lambda_for`/`lambda_against`)
  dos últimos 10 jogos — um proxy direto de favorito×zebra — mas **só alimenta o modelo de partida**
  (gols/1x2), **não** os player props.

## 5. Estado atual no código (file:line exatos)
- **`oppMult` (parte da concessão):** `opponentMultiplier` (`src/model/adjustments.ts:1-6`), aplicado
  em `src/providers/stats.ts:129-133` (clamp 0.7–1.4). Mede concessão **do adversário**, não posse **nossa**.
- **Mando:** `homeAwayMultiplier` (`src/model/adjustments.ts:8-11`), aplicado em
  `src/providers/stats.ts:188`. Não é mismatch.
- **Proxy de força disponível mas desconectado:** `teamRates` (`src/providers/stats.ts:275`) →
  gols for/against. **Não há nenhum fator de posse/mismatch nos player props** hoje: `entityRate`
  (`src/providers/stats.ts:149-222`) compõe `oppMult × tilt × haMult` e **nada** de posse.

## 6. Proposta de implementação
**Recomendar a ordem (a) → (b).** Começar seguro (texto), só depois tocar o número.

**(a) Fase texto — sinal para a IA (via ficha I5), FORA do money-path.**
- Computar uma **estimativa de posse esperada** do jogo (ex.: a partir de `ball_possession` histórica
  de cada time, ou do proxy `lambda_for/lambda_against` de `teamRates`) e anexar ao **contexto** que
  vai para a IA (não ao candidato, não ao μ).
- A IA usa **só como texto** para temperar a explicação/veto:
  *"a Inglaterra deve dominar a bola, então o meio-campo dela tende a desarmar menos"*.
- **Respeita o princípio:** a IA **não** muda o número (ele continua o do código); ela só **explica/
  pondera o risco** com um campo recebido — exatamente o papel dela (`src/ai/reviewer.ts:12-15`).
- **Wire (snake_case PT):** novo campo no `contexto` do reviewer, ex.:
  `posse_esperada: { casa: 0.62, fora: 0.38, mismatch: "alto" }`. Não entra em `buildCandidate`.

**(b) Fase μ — fator/multiplicador calibrado (só se passar).**
- Um `possessionMultiplier(posseEsperada, market)` **puro** em `src/model/adjustments.ts`: **reduz**
  o μ de **desarme** quando a posse esperada do nosso jogador é alta; **aumenta** levemente o de
  **sot/finalização**. Clamp apertado, calibrado.
- Aplicado em `entityRate` (`src/providers/stats.ts:183-188`), compondo com `oppMult` — **com cuidado
  de dupla contagem** (ver Riscos), atrás de **flag por-mercado** (default OFF).
- **Pseudo-código:**
  ```ts
  // domínio puro; clamp apertado, calibrado por mercado
  export function possessionMultiplier(posseEsperadaTime: number, market: string): number {
    if (market === "desarmes") return clamp(1 + K_TKL * (0.5 - posseEsperadaTime), 0.85, 1.15);
    if (market === "sot" || market === "finalizacoes")
      return clamp(1 + K_SHOT * (posseEsperadaTime - 0.5), 0.90, 1.12);
    return 1.0;
  }
  ```

**Ports & Adapters:** a estimativa de posse é derivada no adapter (lê `/stats/` via `client`); o
multiplicador é função pura no domínio. **Gate de paridade:** fase (b) muda μ → re-rodar `npm test`,
re-calibrar, re-congelar golden de `test/parity/` de propósito.

## 7. Plano de validação
- **Fase (a):** não toca o número → validação é **qualitativa** (a explicação fica melhor/coerente?)
  e **não pode** mexer no veredito. Aceita por inspeção + não-regressão de testes.
- **Fase (b):** **medir antes de ligar.** Backtest leave-one-out (adaptar `scripts/backtest-tilt.mts`)
  do mercado de **desarme** com vs sem o fator de posse — **critério: ECE↓ e BrierSkill>0**. Repetir
  para sot/finalizações. Ligar só os mercados que passam (flag por-mercado).
- **Forward (obrigatório p/ (b)):** I7 confirma na Copa (onde os mismatches são frequentes) via
  Brier/ECE/CLV por `market_type`.

## 8. Riscos & armadilhas
- **Dupla contagem (o maior risco):** o `oppMult` **já** absorve parte do efeito (um adversário que
  domina concede poucos desarmes → `oppMult` baixo). Somar um fator de posse por cima pode **contar o
  mesmo efeito duas vezes** → super-correção → ECE pior. A fase (b) tem que ser medida **contra** o μ
  que já tem `oppMult`, não no vácuo. Por isso **começar como texto (a)**.
- **Paridade:** fase (b) muda o money-path → re-freeze consciente das golden.
- **Estimativa de posse é ela mesma incerta** (seleção joga pouco; adversário desconhecido) → encolher
  e usar clamp apertado; fail-closed para 1.0 sem dado.
- **Não virar "filtro de favorito":** posse alta **não** é desculpa para recomendar o favorito —
  valor continua sendo `prob_modelo > prob_devig`. O fator **ajusta o μ**, não vira critério de seleção.

## 9. Dependências
- **I5** (dossiê da IA enriquecido) para a fase (a) — é onde o `contexto` ganha campos.
- **I7** (loop forward) para validar a fase (b) na Copa.
- Reuso de `teamRates` (`src/providers/stats.ts:275`) e/ou `ball_possession` como fonte da estimativa.

## 10. Esforço estimado
**Médio:** fase (a) ≈ 0.5 dia (derivar posse esperada + injetar no contexto + ajuste de prompt/teste).
Fase (b) ≈ 1-1.5 dia (função + flag + calibração leave-one-out + cuidado de dupla contagem) + forward.

## 11. Checklist de aceite
- [ ] Fase (a): `posse_esperada` no `contexto` do reviewer; IA cita em **texto** (sem mudar número); `npm test` verde.
- [ ] Fase (b): `possessionMultiplier` puro em `src/model/adjustments.ts` com teste (fail-closed → 1.0).
- [ ] Fase (b): flag **por-mercado** default OFF; backtest mostra ECE↓ e BrierSkill>0 nos mercados ligados.
- [ ] Fase (b): medido **contra** o μ com `oppMult` (sem dupla contagem); golden `test/parity/` re-congeladas de propósito.
- [ ] `docs/ROADMAP.md` / `docs/PITCH.md` atualizados.

## 12. Como verificar
```bash
# posse real no /stats/ (usa BZZOIRO_API_KEY do .env):
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/9099/stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(j.stats?.home?.ball_possession, j.stats?.away?.ball_possession))'

# fase (b): calibração de desarme com/sem fator de posse (adaptar o script):
npx tsx scripts/backtest-tilt.mts

npm test
```
