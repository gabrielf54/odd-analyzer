# Rito E2E — adicionar uma casa nova ao coletor automático

> **Como usar este arquivo.** Chegue num chat do Claude (plugado no código, este repo) e diga:
> *"Com base em `docs/coleta-odds/IMPLEMENTAR-CASA.md`, vamos implementar a casa **\<X\>**."*
> O Claude segue o rito abaixo de ponta a ponta. **Parte da investigação é feita por VOCÊ**, colando
> os prompts deste doc no **Claude plugado no Chrome** (que roda no seu IP do Brasil, deslogado, e
> enxerga DevTools/Network/Console — coisa que o Claude do código não acessa). O Claude do código lê o
> retorno, decide se tem tudo, e só então programa.
>
> **Quando o rito termina (DONE real):** quando você clica **"obter odds"** no front, num jogo de
> verdade, e a **casa nova aparece sozinha** entre as casas coletadas — sem nenhuma mudança no front.
> Esse é o critério de pronto. Nada de "implementei o parser e parei".
>
> Este doc é o **rito E2E** (exploração no navegador → código → front buscando sozinho). O detalhe de
> engenharia dos passos de código está no [README §6](README.md#6-playbook--adicionar-uma-casa-nova-ex-betano);
> os princípios que não mudam, no [README §5](README.md#5-princípios-que-não-mudam-valem-para-qualquer-casa-nova).
> Casas já feitas servem de molde em [`casas/`](casas/).

---

## 0. Mapa do rito (visão de cima)

| Fase | Quem faz | Entra → Sai | Pronto quando |
|---|---|---|---|
| **F0 — Recon** | **você** cola o Prompt 1 no Claude do Chrome | nome da casa → dados crus | o **Checklist de artefatos (§3)** está completo |
| **F1 — Go / No-Go** | Claude do código | dados crus → decisão | passa no **filtro de captura limpa (§2)** |
| **F2 — Código** | Claude do código | dados → adapter + de-para + registry | `--dry` lista as odds da casa |
| **F3 — Validação local** | Claude do código | código → odds no banco | `npm test`/`typecheck` verdes + CLI grava |
| **F4 — Front E2E** | você + Claude do código | banco → botão funcionando | **botão "obter odds" traz a casa nova sozinho** |
| **F5 — Docs + memória** | Claude do código | tudo → fechado | `casas/<casa>.md` + matriz + memória atualizados |

Se na F0 faltar dado, ou um mercado vier **suspenso ao vivo**, use o **Prompt 2 (§5)** para preencher a
lacuna **antes** de ir pra F2. Não se programa sem amostra real (regra de TDD do projeto).

---

## 1. Por que dois papéis (e por que o navegador)

- **Claude do código (este repo)** escreve adapter/de-para/testes e roda CLI/typecheck. **Não** acessa
  site logado nem vence anti-bot.
- **Claude do Chrome (o que VOCÊ usa)** abre o site `.bet.br` **deslogado, no Brasil**, lê a aba
  **Network**, roda `fetch` no **Console**, confirma os props na tela. É ele quem captura o endpoint cru.

**Higiene legal (vale sempre):** deslogado, volume baixo, com pausa, **sem proxy/VPN rotativo**, nunca
redistribuir o dado. Rodar local no BR mata o geoblock e dá IP residencial limpo. (Ver [README §5](README.md#5-princípios-que-não-mudam-valem-para-qualquer-casa-nova).)

---

## 2. Filtro de captura limpa — Go / No-Go (F1)

A casa **entra** só se cumprir os DOIS:

1. **Captura limpa.** Endpoint de odds **público, deslogado**, que responde por:
   - `fetch` puro (ideal — ex.: KTO/Kambi, Superbet/Fastly, Stake/próprio, Altenar/biahosted), **ou**
   - navegador **headless leve** que resolva no máximo um **Cloudflare passivo** (ex.: Betnacional).
   - **REJEITA:** Turnstile **interativo**, login/token obrigatório, API **paga**, feed **só por
     WebSocket** (ex.: Pixbet/SingleBet) ou **iframe cross-origin** que não dá pra capturar (ex.:
     Brazino/7Platform). Teste de deslogado: re-emitir a chamada com `credentials:'omit'` numa aba
     anônima → **200 JSON** (não 401/403/HTML de Cloudflare).
2. **Mercado útil + liquidação certa.** Cota **pelo menos um** dos nossos mercados de jogador (`sot`,
   `finalizacoes`, `desarmes`, `faltas`) **e** a liquidação bate:
   - **desarmes = realizados/ganhos** (`won_tackle`), não tentados;
   - **faltas = cometidas** (não sofridas — "ganhas"/"recebidas"/"concedidas a favor" são outro mercado, **rejeitar**).

Na dúvida sobre liquidação → **fica de fora** (fail-closed). Mercado errado paga um número e o card mostra outro.

> **Diversidade vale ouro.** Casa com **motor de preço próprio** (Stake, Betfair, Kaizen) muda o line
> shopping de verdade. Empilhar mais uma casa **Sportradar** (Superbet/Betnacional já são) ou **Kambi**
> (KTO já é) dá preço quase igual — registre isso na decisão de F1, mas não é bloqueio.

---

## 3. Checklist de artefatos — "tenho o suficiente?" (fim da F0)

Só vá pra F2 quando **todos** estiverem respondidos com **dado real** (não "deve ser"):

- **A. Identidade/captura** — domínio `.bet.br`; **plataforma/host** capturado; responde **deslogado**
  (200 com `credentials:'omit'`?); perfil de anti-bot (Cloudflare? Turnstile? login?). → define `needsBrowser`.
- **B. Endpoint de ODDS de UM jogo** — URL completa + método + params; precisa header/cookie/token?
- **C. Endpoint da LISTA de jogos (crosswalk)** — URL; **idioma** dos nomes dos times (PT/EN/FR); qual
  campo é o **id do jogo**; esse id é o **mesmo** que vai no endpoint de odds? (confirmado)
- **D. Shape do outcome** — qual campo é o **jogador**, qual é a **linha**, qual é a **odd**, qual marca
  **over/under**, qual liga ao **mercado** (id/label), e qual marca **suspenso/sem preço**.
- **E. De-para** — para **cada** mercado nosso: a **chave estável** (marketId numérico **ou** label EN
  limpo) + a **string/id real**; e os mercados a **REJEITAR** (faltas sofridas, tempo parcial, time/partida, subtipos).
- **F. Liquidação** confirmada por mercado (Opta/Sportradar; desarmes=ganhos; faltas=cometidas).
- **G. Amostra JSON REAL** de `/odds` **e** da lista — colada (pro teste TDD). Sem amostra, não codamos.
- **H. Chave estável ENTRE JOGOS** — o marketId/label é o **mesmo em qualquer partida** (confirmado em
  **≥2 eventos** distintos). Se mudar por jogo, o de-para não generaliza → resolver antes.

Faltou algo (ou mercado suspenso ao vivo) → **Prompt 2 (§5)**.

---

## 4. PROMPT 1 — Recon completo da casa (cole no Claude do Chrome)

> Troque `{CASA}` e `{DOMINIO}` (ex.: `Betfair` / `betfair.bet.br`). Se não souber o domínio, peça
> pra ele descobrir. O objetivo é fechar **A–G** do checklist numa rodada.

```
Você é um investigador técnico de sportsbooks. Estou montando um coletor automático de odds e preciso mapear UMA casa: {CASA} ({DOMINIO}). Você roda no navegador, no Brasil, DESLOGADO. Leia apenas odd pública, volume baixo, SEM criar conta, SEM login.

Quero descobrir QUAL PLATAFORMA de odds a casa usa e SE o feed é acessível por requisição pública deslogada. Assinaturas conhecidas (classifique pelo HOST das requisições de rede):
- KAMBI → host "kambicdn.com"/"kambicdn.org"/"offering-api"; caminho /offering/v2018/{operatorCode}/...
- SPORTRADAR/BETRADAR → menciona "betradar"/"sportradar", ids "sr:player:..."; ou CDN "fastly.net"; ou provider=ramp
- ALTENAR → host "biahosted.com" (ex.: sb2frontend-altenar2.biahosted.com), param integration=
- KAIZEN → "kaizengaming"/"GameplAI" (difícil)
- Própria/proprietária → host de 1ª parte (domínio da própria casa)
- Se não bater em nenhuma → anote o host cru.

Capture o JSON cru assim (DevTools → Console):
  fetch(URL, {credentials:'omit'}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j).slice(0,4000)))
Encurte arrays gigantes, mas mantenha a ESTRUTURA (chaves) e inclua exemplos reais dos mercados de jogador.

PASSOS:
1. Abra {DOMINIO}, deslogado. Vá em Futebol e abra UM jogo com mercados de jogador (de preferência da Copa do Mundo).
2. Abra a aba de mercados de JOGADOR (procure "Jogador", "Chutes", "Finalizações", "Desarmes", "Faltas").
3. DevTools → Network → XHR/Fetch: ache a requisição cuja RESPOSTA é JSON com as odds dos jogadores. Anote:
   - URL completa + método + params + HOST (classifique pela tabela acima)
   - Precisa header/token/cookie? TESTE: copie a URL e rode o fetch com credentials:'omit' numa aba anônima → 200 JSON ou 401/403/Cloudflare?
   - No JSON: ONDE está o JOGADOR, a LINHA, a ODD, o que marca OVER/UNDER, o que liga ao MERCADO (id ou rótulo), e o que marca SUSPENSO/sem preço. Cole um trecho real.
4. Ache a requisição da LISTA de jogos do torneio (crosswalk): URL + em que idioma vêm os nomes dos times + qual campo é o id do jogo + esse id é o mesmo do endpoint de odds?
5. Anti-bot: tem Cloudflare? Turnstile/captcha? Geoblock? Exige login pra ver odd?
6. PROPS — confirme quais destes a casa cota, com o RÓTULO/ID EXATO e a regra de liquidação:
   - Chutes a gol / Shots on Target
   - Finalizações totais / Total de chutes
   - Desarmes — diga se é "realizados/ganhos/completados" ou "tentados" (IMPORTA)
   - Faltas — diga se é "cometidas/concedidas" ou "sofridas/ganhas" (IMPORTA; quero só as COMETIDAS)
   - Bônus: gols over/under, resultado 1X2, escanteios?
7. DE-PARA — para CADA mercado de jogador que me importa, me dê o par (chave estável, rótulo real). A chave estável é o marketId NUMÉRICO se existir; senão o rótulo em inglês/limpo. Inclua também o id/rótulo dos mercados a REJEITAR (faltas sofridas, tempo parcial, subtipos).

FORMATO DA RESPOSTA: um bloco para a casa com EXATAMENTE estes campos, mais os JSONs reais colados:
| Casa | Domínio | Plataforma (host) | operatorCode/integration/id | Endpoint odds (URL+método) | Responde deslogado (credentials:'omit')? | Endpoint lista de jogos (+idioma dos times) | Anti-bot | Props cobertos + liquidação | Pares de de-para (chave→mercado) + rejeitados | Campos do JSON: jogador/linha/odd/over-under/mercado/suspenso |

Seja factual. Campo não verificado = escreva "não verificado", não invente. Cole URLs e trechos de JSON REAIS.
```

---

## 5. PROMPT 2 — Preencher lacunas / confirmar (cole no Chrome, se preciso)

> Use quando a F0 deixou buracos: um mercado **suspenso ao vivo**, falta amostra do mercado-diferencial
> (desarmes), ou dúvida se a chave de de-para é **a mesma entre jogos** (checklist **H**). Troque os
> `{...}`. Foi exatamente esse prompt que fechou o Stake.

```
Continue a investigação SÓ na casa {CASA} ({DOMINIO}), deslogado, no Brasil. Preciso de amostras de JSON REAIS (não descrições). Use o Console:
  fetch(URL,{credentials:'omit'}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j)))

CONTEXTO: alguns mercados de jogador (ex.: desarmes/faltas) ficam SUSPENSOS quando o jogo entra AO VIVO. Por isso use UM jogo que ainda esteja PRÉ-JOGO (dateStart no futuro), com mercados de jogador ativos.

Responda:

1) MERCADO-DIFERENCIAL (ex.: DESARMES) — cole 2 ou 3 seleções reais desse mercado (chave/marketId, nome do jogador, linha, odd, e o campo over/under). Existe só "Mais"(Over) ou também "Menos"(Under)?

2) OUTRO MERCADO PEDIDO (ex.: FALTAS COMETIDAS) — idem: 2-3 seleções reais.

3) CHAVE DE DE-PARA ESTÁVEL ENTRE JOGOS — neste jogo NOVO (id diferente do anterior), os mercados que já mapeei ainda usam a MESMA chave/marketId de antes? Responda sim/não e cole a chave real que apareceu pra cada um. (Quero confirmar que a chave identifica o TIPO de mercado globalmente e não muda por partida.)

Diga qual jogo/eventId você usou e confirme que todos os endpoints responderam 200 deslogado (sem 401/403).
```

---

## 6. F2 — Código: onde mexer (3 toques, nada mais)

Padrão **Ports & Adapters**: o motor de coleta (`src/collect/`) é **puro** (sem `fetch`/Playwright/banco).
Adicionar casa = **adapter + de-para + uma entrada no registry**. Nada no front, no endpoint ou no serviço.

1. **`src/collect/adapters/<casa>.ts`** (novo) — copie o molde mais parecido:
   - **marketId numérico** como chave → molde **`superbet.ts`** (emite `market_label = String(marketId)`).
   - **rótulo de texto** como chave → molde **`kto.ts`** (limpa o sufixo de liquidação antes).
   - Exporta: `parse<Casa>Odds(data, book): RawCollectedLine[]` — só **over** (filtra o campo over/under),
     pula **suspenso/frozen**, `linha_raw` = a linha crua, `entidade` = jogador, `market_label` = a chave
     do de-para. E `parse<Casa>EventList(data): HouseEvent[]` (`{id, home, away}` — times no idioma cru,
     o `canonicalTeam` resolve PT/EN/FR). Mais os **URL builders** (odds de 1 jogo + lista do torneio).
2. **`src/collect/tables.ts`** — `export const <CASA>_TABLE: HouseMarketTable = { ... }` mapeando a chave
   **exata** (o normalizer faz lower/trim/sem-acento; **nunca substring**) → `{ market_type }`, com
   `{ reject: "motivo" }` nos que não queremos (faltas sofridas etc.). Some um `case "<casa>": return <CASA>_TABLE;` no `tableFor()`.
3. **`src/collect/houses.ts`** — importe os parsers/URLs e adicione **uma** entrada em `HOUSES`:
   `{ book:"<casa>", needsBrowser:<true se Cloudflare>, oddsUrl, parseOdds, listUrl, parseList }`.
   (`needsBrowser:true` faz o `makeFetchers` abrir o Chromium; `false` = `fetch` puro.)
4. **(Opcional)** `src/cli/collectOdds.ts` — uma flag `--<casa> <id>` que preenche `overrides.<casa>`
   (só pra forçar o id à mão se o crosswalk falhar; não é obrigatório).
5. **TDD** em `test/` — escreva o teste **com a amostra real** (do checklist **G**) **antes**: o parser
   devolve jogador+linha+odd certos, o de-para mapeia os mercados nossos e **rejeita** o resto (faltas
   sofridas, não-mapeados), e linha sem `.5`/`N+` é descartada.

**Invariantes que não se quebram:** parser **puro** (sem rede/estado); de-para **exato e fail-closed**;
`parseLinha` só aceita over (`X.5` ou `N+`); a IA nunca calcula número; **nada disso toca `model/`/`value/`**
→ o gate de paridade segue verde.

---

## 7. F3 — Validação local

```bash
npm test && npm run typecheck            # gate de paridade + tipos — devem ficar verdes

npx tsx src/cli/collectOdds.ts <event_id_BSD> --dry   # NÃO grava: confere as odds da casa nova + divergências
npx tsx src/cli/collectOdds.ts <event_id_BSD>          # grava no `odds` + re-espelha odds_unificadas
```

No `--dry`, confirme que a casa nova aparece em `casas: <casa> ✓(N)` com **N > 0** e que as linhas dela
batem com o que o site mostra (alguns jogadores conferidos na mão). Cheque as **divergências** cross-casa
(odd muito fora das outras = erro de de-para/linha, não sinal).

---

## 8. F4 — Front E2E (o DONE de verdade)

O botão **"obter odds"** do front chama `POST /jogos/:eventId/coletar-odds`, que roda
`coletarOddsService → runCollection` — e `runCollection` **varre o `HOUSES`**. Como a casa nova já está
no `HOUSES` (F2), o botão a coleta **automaticamente**: grava no `odds`, re-espelha `odds_unificadas`, e a
análise lê. **Nenhuma mudança de front/endpoint/serviço é necessária.**

Verificação:
1. Suba o backend: `npm run dev` (Express na 5926). Suba o front (`odd-analyzer-frontend`, na 5927).
2. Abra um jogo **real** da Copa e clique **"obter odds"**.
3. **Confirme**: no retorno (e na tela de conferência) a casa nova vem entre as casas, com `ok:true` e
   `n>0`; as linhas dela entram no **line shopping** e na análise. Cruze com o site pra ver que o preço bate.

> **Só está PRONTO quando a casa nova aparece sozinha ao clicar o botão num jogo real** — não antes.
>
> *Cosmético (não bloqueia):* se o front tiver **nome/logo por casa**, o slug novo pode renderizar sem
> rótulo bonito. A coleta funciona mesmo assim; ajustar o rótulo de exibição é um follow-up no repo do front.

---

## 9. F5 — Docs + memória (fechar no mesmo trabalho)

- Crie **`docs/coleta-odds/casas/<casa>.md`** (molde: as fichas existentes — status, plataforma, como
  busca, anti-bot, endpoints, shape/parsing, de-para+liquidação, crosswalk, validação ao vivo).
- Atualize a **matriz da [§3 do README](README.md#3-estado-das-casas)** (casa, plataforma, como busca,
  anti-bot, status, mercados — e se traz **motor de preço novo** = diversidade real).
- Atualize a **memória** (`memory/MEMORY.md` + um arquivo da casa): plataforma, deslogado sim/não,
  mercados cobertos, e o ganho de diversidade.

---

## Apêndice — lições que viraram regra (de Superbet/Stake)

- **Jogo AO VIVO suspende props** (desarmes/faltas somem do `/odds`) → capture a amostra **pré-jogo**.
- **Chave de de-para com sufixo de linha** (ex.: `marketId` vem `..._15` no `/markets` mas **base** no
  `/odds`) → case pela **base** (`String(id).split('_')[0]`). Confirme a chave em **≥2 jogos**.
- **Faltas:** os rótulos enganam. "**cometidas/concedidas**" = o que queremos; "**ganhas/sofridas/recebidas**"
  = mercado diferente, **rejeitar** explicitamente (com `reject:`) pra não vazar.
- **Teste de deslogado** = `fetch(url,{credentials:'omit'})` numa aba anônima → 200 vs 401/403/HTML CF.
- **Fora do filtro limpo:** feed **só por WebSocket** (Pixbet/SingleBet) e **iframe cross-origin**
  (Brazino/7Platform) — dá pra identificar a plataforma, mas não capturar a odd por `fetch`. Não entram.
- **A pesquisa de mesa erra a plataforma** (a web disse "Stake é Kambi"; a captura provou motor próprio).
  **Só a captura no navegador, deslogado, no BR, é fonte de verdade** — web research só dá pista.
