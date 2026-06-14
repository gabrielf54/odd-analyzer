# Coleta automática de odds — STATUS & veredito de viabilidade

> **Leia isto primeiro.** A `spec.md` é o brainstorming original (decisões travadas). Este
> `STATUS.md` é o **veredito de viabilidade** (avaliação técnica/legal/código + pesquisa de
> campo das 4 casas) e o **estado de implementação** — para retomar em outro chat.
>
> **Atualizado:** 2026-06-13 · **Estado:** Fase 0 PENDENTE (depende do dono no DevTools) ·
> motor (normalizer/anti-armadilha/line-shop) EM IMPLEMENTAÇÃO nesta sessão.

---

## 0. Resumo leigo (1 parágrafo)

A ideia **funciona** e dá pra chegar onde você quer (parar de colar odd à mão, comparar várias
casas, apostar no melhor preço). Mas três coisas que a spec deixou parecer fáceis não são: (1) **as
4 casas não são iguais** — duas são moleza (KTO, Betnacional), uma é difícil (Superbet) e uma é
quase guerra (Betano, justo uma das suas favoritas hoje); (2) o "**comparar casas e pegar o melhor
preço**" (a alma da feature) **ainda não existe no código** — é trabalho novo, não "liga e funciona";
(3) o **endereço secreto** de onde cada casa serve a odd de **jogador** (não a de partida) ainda não
foi achado — e achar isso depende de **você abrir o site no Chrome e copiar a requisição** (a "Fase
0"). Legalmente está **tranquilo**: ler odd pública (deslogado) não é crime no Brasil.

---

## 1. Veredito por casa (pesquisa de campo 2026-06-13)

Detalhe completo (endpoints, evidências, o que falta) em [`casas/`](casas/). Resumo:

| Casa | Plataforma | Endpoint público | Geoblock | Prop de jogador | Dificuldade | Status |
|---|---|---|---|---|---|---|
| **KTO** | **Kambi** (turnkey) | ✅ confirmado (`kambicdn.org`, GET JSON puro) | provável (mitiga rodando no BR) | provável (Kambi expõe SOT/chutes/faltas) | 🟢 **baixa** | **GO** — 1ª casa |
| **Betnacional** | NSX/Bet6 + **Sportradar** | ✅ **provado ao vivo** (deslogado, fora do BR) | **não** | provável (GraphQL, não localizado) | 🟡 **média** | **GO** — 2ª casa |
| **Superbet** | própria ("Betler") | ✅ provável (hosts Fastly, sem WAF) | provável (só no api-gw) | provável (federação `playerFocusedExperience`) | 🟠 **alta** | **2ª onda** |
| **Betano** | **Kaizen Gaming** | ⚠️ existe mas só raspável via browser stealth | **sim, duro** | ⚠️ **desconhecido** (camada GameplAI separada) | 🔴 **alta** | **adiar / talvez manual** |

**Decisão de escopo (revisada):** v1 = **KTO + Betnacional**. Superbet em 2ª onda. **Betano fica de
fora do v1 automático** — Kaizen tem geoblock duro + provável Cloudflare/Turnstile, e os player
props vivem numa camada de trading separada (GameplAI, adquirida mar/2026) carregada sob demanda e
possivelmente mais blindada. Pode acabar junto da **bet365 no balde "manual fallback"**, ou só
funcionar via navegador real local. (Spec §2.4 já põe bet365 nesse balde; Betano se aproxima dele.)

---

## 2. O LINCHPIN escondido: ONDE o coletor roda

A pesquisa testou de **servidor fora do BR** → tomou geoblock (Betano e o api-gw da Superbet
devolveram 403/bloqueio para IP estrangeiro; a regulação .bet.br 2025 exige geolocalização real e
bloqueia VPN/proxy de datacenter).

**Mas o uso é "sob demanda quando EU analiso" → backend roda na máquina do dono, IP residencial
brasileiro.** Isso **elimina o geoblock** e dá IP BR limpo a **$0**. Rodar local (o `npm run dev` na
:3001 que já existe) é o caminho certo. Server na nuvem fora do BR exigiria proxy BR (custo + flag).

➡️ **Regra:** o coletor roda no ambiente BR do dono. Deslogado, volume baixo, backoff educado,
**sem** proxy/VPN rotativo (aumenta flag e flerta com "burlar mecanismo" — ver §4 legal).

---

## 3. As 3 frentes NET-NEW (a spec disse "nada muda a jusante" — é PARCIAL)

O caminho cru (parse → tabela `odds` → match → candidato → motor de probabilidade) **engole 4 casas
sem quebrar** — isso a spec acerta. Mas o **diferencial (line shopping) NÃO existe** e é código novo
(auditoria de código, com arquivo:linha):

| # | Frente | Severidade | O que falta | Onde |
|---|---|---|---|---|
| A | **Line shopping** | 🔴 crítico | ✅ **FEITO** — `src/collect/lineShop.ts::pickBestPrice` colapsa as N casas de cada (jogador,mercado,linha) na de maior `odd_over`, anexa `casas_comparadas`; ligado no `analyzeManual` (antes do loop de mercado); `book`/`casas_comparadas` agora viajam até o candidato (`builder.ts`). | `src/collect/lineShop.ts`, `analyze.ts`, `builder.ts` |
| B | **`book` no `paper_ledger`** | 🟡 rebaixado | A **colisão** que motivava isto (4 casas → dedup last-wins) **deixou de existir**: a frente A colapsa p/ 1 book por linha **antes** do ledger. Resta só **provenance** (registrar de qual casa veio a odd) — **diferida pro go-live do coletor** (migração `add_book_to_paper_ledger`, aditiva/nullable/fora da unique, **aplicar COM o dono** — o classificador de prod barrou aplicar sozinho, e é o certo). | migração futura |
| C | **Anti-armadilha cross-casa** | ✅ **FEITO** | `src/collect/antiTrap.ts::flagDivergences` marca p/ REVISÃO grupos com gap ≥ limiar (default 20pp); ligado no `analyzeManual` (campo `divergencias` no resultado). Validado nos 2 casos reais da spec §12 (Paquetá ~8pp não flaga; Igor Thiago ~27pp flaga). Limiar percentil-por-mercado = follow-up forward. | `src/collect/antiTrap.ts`, `analyze.ts` |
| D | **Latência síncrona** | 🟡 médio | Mantida a arquitetura segura: coleta é passo separado que popula `odds`; `analyzeManual` só consome. `pickBestPrice`/`flagDivergences` são puros e rápidos (rodam in-process, sem I/O). Wiring do fetch das casas → pós-Fase 0. | `app.ts`, `service.ts` |

---

## 4. Legal — VERDE (ler odd pública deslogado)

- **Não é crime no Brasil.** Sem equivalente ao CFAA; a Lei 12.737 exige "violar mecanismo de
  segurança" — JSON público não tem barreira a violar.
- **LGPD não pega:** odd ≠ dado pessoal (art. 5 I). É o maior risco de scraping no BR e cai fora.
- **Regulação 2025 (Lei 14.790)** só obriga **operadores**, não o apostador.
- Único risco = **civil/contratual (ToS)** — no máximo ban de IP/conta, reversível.
- **Higiene (linha vermelha):** deslogado sempre; rate-limit educado + jitter; sob demanda (poucos
  jogos); UA honesto; respeitar 429/Retry-After; **NÃO** usar proxy/VPN rotativo; **nunca**
  redistribuir/revender a base raspada. Não contornar captcha/auth/paywall (aí vira Lei 12.737).

---

## 5. Normalização (o coração #2) — armadilhas que matam EV

A casa escreve a mesma aposta de N jeitos, e mercados que parecem iguais são diferentes. Errar = o
motor compara laranja com maçã = **EV fantasma = dinheiro perdido**. As armadilhas (e a mitigação no
`OddsNormalizer`):

| Armadilha | Risco | Mitigação |
|---|---|---|
| **Desarmes: tentativas vs ganhos** | modelo decompõe p/ `won_tackle`; casa que cota TENTATIVAS dá odd ~1.6× mais barata → valor fantasma sistemático + settle corrompido | ler **regra de liquidação**, não o rótulo; cross-check implícita-da-casa vs `μ_tentativas`/`μ_ganhos` |
| **SOT ↔ finalizações invertem** | mesmo `stat_field`, settle/estrela diferentes; rótulos PT colidem ("Chutes a gol"=SOT **contém** "Chutes"=total) | de-para **string exata**, NUNCA substring; cross-check **SOT ≤ finalizações** |
| **Faltas cometidas vs sofridas** | Igor Thiago gap 27pp (spec §12) é **provavelmente isso**; atacante sofre >> comete | fail-closed: "faltas" sem "cometidas" explícito → **rejeitar**; suspeita se alta+barata em atacante |
| **Passes: total vs certos / escada** | `total_pass` ≠ `accurate_pass`; degraus diferem por casa; `sem_devig` (K<3) degrada **silencioso** | confirmar settle por casa; fazer `sem_devig` **borbulhar** aviso |
| **Exato N / handicap / SGM / anytime** | "exatamente 2" vira "over 1.5" se parser só lê o número → infla EV | whitelist de **subtipo** do campo estruturado do JSON, nunca do número do rótulo |

**Lacuna estrutural:** `markets.ts` tem **um** `settle_field` por mercado — mas casas diferentes
podem liquidar o mesmo rótulo com Opta stats diferentes. A ficha da Fase 0 de cada casa **tem que
registrar qual stat Opta aquela casa liquida** (ver template em [`casas/`](casas/)).

---

## 6. Plano de implementação (ordem) & PROGRESSO

> Gate (spec §13): **sem ficha de endpoint (Fase 0), não se escreve o `fetch` do adapter.** O
> *parser* do shape conhecido (Kambi/Sportradar) pode ser escrito antes, com fixtures.

| Passo | O que | Depende de | Status |
|---|---|---|---|
| 0 | **Fase 0** — capturar no DevTools o endpoint de **PROP** de KTO + Betnacional (ver ficha de cada casa: exatamente o que copiar) | **DONO** (Chrome BR) | ⏳ **PENDENTE — próximo passo** |
| 1 | `OddsNormalizer` (`src/collect/normalizer.ts`): `parseLinha` + de-para fail-closed + whitelist de subtipo | — | ✅ **FEITO** (TDD, 15 testes) |
| 2 | Anti-armadilha cross-casa (`src/collect/antiTrap.ts::flagDivergences`) | — | ✅ **FEITO** (TDD, 5 testes) |
| 3 | Line-shopping (`src/collect/lineShop.ts`) + `book`/`casas_comparadas` no candidato + wiring no `analyzeManual` | — | ✅ **FEITO** (TDD; gate de paridade intacto) |
| 4 | Porta `OddsCollector` + `collectAll` ("pula e avisa") + parser Kambi (`adapters/kto.ts`) | parser sim; fetch ⇒ Fase 0 | ✅ **parser+orquestração FEITOS** (TDD); fetch/endpoint = Fase 0 |
| 4b | De-para por casa (`src/collect/tables.ts`) | strings exatas ⇒ Fase 0 | 🟡 **PLACEHOLDER** (KTO esboçado, Betnacional vazio; desarmes/faltas em `reject` até confirmar liquidação) |
| 5 | Matching jogo + jogador (reusa `crosswalk/match` Dice, fail-closed) | — | reusa o que existe |
| 6 | Provenance `book` no `paper_ledger` (frente B) — migração aditiva **com o dono** | — | diferido pro go-live |
| 7 | Wiring: coletor popula `odds` (passo separado) → análise lê (frente D) | Fase 0 | depois da Fase 0 |
| 8 | Front: botão "buscar odds" + mostrar `linhas_rejeitadas`/`divergencias` + destaque de outlier | repo frontend | depois |

### O que JÁ roda (nesta sessão, 357 testes verdes, typecheck limpo, gate de paridade intacto)
- **Motor de coleta puro e testado** (`src/collect/`): `parseLinha`, `normalizeCollected` (de-para fail-closed + whitelist de subtipo), `pickBestPrice` (line shopping), `flagDivergences` (anti-armadilha), `collectAll` (orquestração "pula e avisa"), `parseKambi` (parser KTO).
- **Line shopping ligado de ponta a ponta no `analyzeManual`:** N casas → 1 candidato no melhor preço, `book`+`casas_comparadas` no candidato, `divergencias` no resultado. Funciona já p/ odds coladas de 2+ casas (manual), e plugará no coletor quando a Fase 0 entregar os endpoints.
- **Falta só a Fase 0** (dono) p/ destravar os adapters de fetch e o wiring final.

**O que o dono precisa fazer (Fase 0) — UMA VEZ por casa, via HAR (jeito escolhido):**
1. Abrir a casa **DESLOGADO** (props são públicos; assim o HAR não leva cookie de sessão → seguro
   compartilhar) no Chrome BR.
2. Navegar até **um jogo** e **abrir a aba de prop de jogador** (é o clique que dispara a request).
3. `F12` → **Network** → gravando + **Preserve log** ligado → clicar de novo na aba de prop.
4. Botão direito na lista → **"Save all as HAR with content"** → mandar o `.har` (um por casa).
O Claude extrai URL + params + headers + shape do JSON do HAR e preenche o adapter + a de-para.

**É captura ÚNICA, não por jogo.** O endpoint da casa é FIXO; só o `{eventId}` varia, e o sistema
deriva sozinho (casa o jogo por times+data). O dono só recaptura se a casa TROCAR a API (raro — o
adapter "falha alto" e avisa). Depois do HAR: adapters de fetch + wiring destravam (plug-and-play).
