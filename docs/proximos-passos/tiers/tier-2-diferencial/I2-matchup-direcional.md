# I2 — Matchup direcional dentro do μ (o diferencial #1)

> **❌ BLOQUEADO POR DADO (sonda BSD ao vivo, 2026-06-11) — NÃO IMPLEMENTAR sem fonte nova.**
> A premissa desta ficha (`average_positions` "vem de graça na BSD") está **ERRADA**. Re-sondado:
> a BSD **não tem** `average_positions`, nem `shotmap`/heatmap (player-stats sem coordenada; lineup
> só `position` nominal G/D/M/F + `formation`; `/shotmap//heatmap//positions/` = **404**). Não há
> sequer como separar lateral **esquerdo × direito**. Logo **não existe "lado de ataque" no dado free**
> → o estimador direcional não tem insumo. Só volta com **fonte posicional/zonal paga** (Opta/StatsBomb/
> SofaScore zonas — fora do orçamento ~$20). Por ora, vale o nível **por-mercado** (`oppMult` escalar, já
> no motor) e o confronto direcional segue como **raciocínio/explicação** (não vira número). O texto
> abaixo fica como **norte condicionado a dado**, não como plano executável hoje.

## 1. TL;DR
Hoje o multiplicador de concessão (`oppMult`) é um **escalar de time** — igual para todo jogador
daquele adversário. O **diferencial #1 do produto** é torná-lo **direcional**: cruzar o **lado de
ataque** de quem produz a ação com o **flanco/posição específica** do defensor que vai absorvê-la.
O dado para isso (`average_positions`) **vem de graça** na BSD. **Mas o estimador tem que ser
SUAVE** — a versão crua (bucket D/M/F) já foi medida e **piorou a calibração**; está DESLIGADA.

## 2. Status
- **Ajuda à meta:** **Alto** (é o diferencial competitivo; é o "norte" do `CLAUDE.md`).
- **Pronto p/ Copa:** ⏳ Não agora. Exige spike de coordenadas + estimador suave + gate por-mercado
  + **prova forward**. Em jogos isolados a amostra de seleção é pequena demais para confiar cedo.
- **Esforço:** **Alto**.
- **Risco de calibração/paridade:** **ALTO** — muda o μ no money-path (golden de `test/parity/` têm
  que ser re-congeladas de propósito) **e** o histórico mostra que o estimador direcional cru
  **degrada ECE**. Este é o item de maior risco do tier.
- **Custo de dado:** **$0** (`average_positions` e `shotmap` já vêm no `/player-stats/`).

## 3. Problema / fundamento (confronto × concessão × EV)
O `CLAUDE.md` define o norte: **todo sinal nasce do encaixe oferta × concessão no MESMO EIXO** —
`μ_base(quem produz a ação) × multiplicador_concessão(adversário no mesmo eixo)`. O exemplo canônico
é **direcional**:

> **Time A ataca muito pela esquerda** + **lateral-direito do Time B desarma muito** → o volume
> defensivo daquele lateral sobe → **over desarmes do lateral-direito** tem valor.

Hoje o motor captura só a **metade não-direcional** disso: `oppMult` mede "o adversário concede X no
mercado Y **no total**", e aplica o **mesmo** multiplicador a todo jogador do adversário. Ele **não
sabe** que o volume defensivo se concentra **naquele flanco** porque é **ali** que o ataque vem.
O `average_positions` dá o **lado** (corredor lateral) de cada jogador **de graça** — é exatamente o
ingrediente que falta para passar do "time concede X" para "este defensor, neste flanco, contra este
ataque, concede X′".

Direcional bem-feito → `prob_modelo` mais afiada **onde o confronto é assimétrico** → mais valor
real (`prob_modelo > prob_devig`) **sem** inflar o resto. Direcional **mal**-feito (ruidoso) → ECE
sobe → o número mente → −EV. Por isso o estimador é tudo.

## 4. Evidência real (números + file:line)
- **`average_positions` vem por jogo, por time, com lado:** a sondagem do amistoso 9099 trouxe
  `average_positions.{home,away}[]` = `{ n: <toques>, x, y, pos, name, player_id }` — README mestre
  §1.2 (`docs/proximos-passos/README.md:40`). **`y` é o eixo lateral** (esq↔dir): num jogo real,
  Arroyo apareceu com `y≈26.8` (um corredor) e Sinisterra com `y≈73.6` (o outro). **`x` é a
  profundidade** (defesa↔ataque). Presente **em seleção** (amistoso 9099: `home` com `n=22`).
- **`shotmap` também dá zona** (de onde saem as finalizações) — outro eixo direcional disponível.
- **O direcional cru JÁ falhou:** `src/model/params.ts:16-21` documenta o backtest de 2026-06-10
  (`scripts/backtest-tilt.mts`, n=201/mercado, over 1.5): **desarmes ECE +10.1%**, **sot ECE +20.0%**
  (ambos acima do limite +5% → FALHOU), **finalizações ECE −13.1%** (melhorou). Por isso
  `POSITIONAL_TILT_ENABLED = false` (`src/model/params.ts:21`).
- **O que existe hoje é bucket D/M/F, NÃO lado x/y:** as constantes de share são por posição
  (`POSITIONAL_SHARE_NACIONAL`, `src/model/params.ts:11-15`) e a agregação da concessão é por
  D/M/F (`teamConcededByPosition`, `src/providers/stats.ts:100-127`) — **não** por corredor x/y.
  **O direcional por flanco ainda NÃO existe.**

## 5. Estado atual no código (file:line exatos)
- **Multiplicador escalar de time:** `opponentMultiplier` (`src/model/adjustments.ts:1-6`), clampado
  em `oppMult` (`src/providers/stats.ts:129-133`, faixa 0.7–1.4). É o que se quer **especializar por flanco**.
- **Tilt posicional (cru, desligado):** `positionalTilt` (`src/model/adjustments.ts:16-21`) — clamp
  `TILT_MIN=0.85`..`TILT_MAX=1.20` de `shareAdv/shareBase`. Constantes/flags em
  `src/model/params.ts:11-15` (`POSITIONAL_SHARE_NACIONAL` por D/M/F por mercado), `:21`
  (`POSITIONAL_TILT_ENABLED=false`), `:22` (`POSITIONAL_MIN_GAMES=5`).
- **Onde o tilt entraria no μ:** `src/providers/stats.ts:170-186` — `entityRate` calcula `shareBase`
  por posição, e **se ligado** busca `teamConcededByPosition` e multiplica `oppMult * tilt` (re-clampado).
  É o ponto de injeção do fator direcional.
- **Concessão por posição (não por lado):** `teamConcededByPosition` (`src/providers/stats.ts:100-127`)
  agrega o `statField` concedido pelos adversários **por bucket D/M/F** (usa `playerPosition`,
  `src/providers/stats.ts:88-96`). **Falta** a variante que agrega por **zona x/y (flanco)**.
- **Posição/lado do jogador analisado:** o `ctx.posicao` chega em `entityRate`
  (`src/manual/analyze.ts:128` monta o ctx). Hoje é só a sigla D/M/F — **não** carrega o lado (y).

## 6. Proposta de implementação (receita concreta, passo a passo)
**Respeitar Ports & Adapters:** o adapter BSD (`stats.ts`) busca `average_positions`/histórico e
**deriva perfis numéricos** (puros); o **encaixe e o multiplicador** são funções **puras** no domínio
(`adjustments.ts`), testáveis com fakes. **Respeitar o gate de paridade:** atrás de uma flag
**por-mercado** (default OFF); mudança de μ exige re-rodar `npm test`, re-calibrar e **re-congelar as
golden de `test/parity/` de propósito**, com nota no commit.

**(1) SPIKE de orientação de coordenadas (~1h) — pré-requisito.**
`average_positions` orienta cada time **no mesmo sentido de jogo**? Ou cada um aparece atacando para
um lado (coords "reais" do campo)? Sem saber isso, "esquerda do A" pode bater com "esquerda do B"
**fisicamente oposta**. Teste: pegar um **ponta conhecido** (lado sabido) e comparar o `y` dele
**em casa vs fora** em 2-3 jogos. Decidir uma **normalização**: rotacionar/espelhar para que **todo
time ataque esquerda→direita** e os corredores fiquem comparáveis. **Não avançar sem isso resolvido.**

**(2) Perfil de ataque do time (histórico N jogos).**
Para o time de quem produz a ação: **share de toques no terço ofensivo por corredor** (esq/centro/dir,
fatiando o `y` normalizado em 3 faixas; terço ofensivo via `x`). Como seleção joga pouco, **encolher
forte** (shrinkage com prior = distribuição uniforme dos corredores, `priorStrength` alto) para não
reagir a 1-2 jogos. Saída: `share_ataque = { esq, centro, dir }`.

**(3) Perfil de concessão do defensor por flanco.**
Estender `teamConcededByPosition` (`src/providers/stats.ts:100-127`) para agregar **por zona x/y**:
o **volume defensivo** (`total_tackle` + `interception`) dos defensores adversários **por corredor**,
nos jogos do adversário. Saída: `concessao_flanco = { esq, centro, dir }` (encolhida igual).

**(4) Encaixe (o confronto).**
Alinhar o corredor de **maior produção** do atacante com o **flanco** do defensor-alvo. O
multiplicador direcional do jogador = quanto o **cruzamento dos dois perfis** desvia do neutro
(ex.: produtor concentra no corredor onde aquele defensor concede acima da média → multiplicador > 1).
Aplicado **no μ daquele jogador específico**, no ponto de `src/providers/stats.ts:183-186` (compondo
com `oppMult`, re-clampado).

**(5) Estimador SUAVE obrigatório (o cru degradou ECE).**
- **Shrinkage** em ambos os perfis (ataque e concessão) — prior forte por causa da amostra de seleção.
- **Clamp apertado** no multiplicador final (mais apertado que 0.85–1.20; calibrar a faixa).
- **Gate por-mercado:** ligar **só** onde o leave-one-out mostra **ECE↓ e BrierSkill>0** — exatamente
  como **finalizações** reagiu bem ao tilt (`src/model/params.ts:20`), e **desarmes/sot** não.
  Implementar como um mapa `DIRECTIONAL_ENABLED: Record<market, boolean>` em `src/model/params.ts`,
  análogo ao `POSITIONAL_TILT_ENABLED` atual, mas **por mercado**.

**Pseudo-código (domínio, puro):**
```ts
// src/model/adjustments.ts (novo) — tudo encolhido a montante, clamp apertado
export function directionalMultiplier(
  shareAtaque: Corredores,      // {esq,centro,dir} do produtor (encolhido)
  concessaoFlanco: Corredores,  // {esq,centro,dir} do defensor-alvo (encolhido)
  baseConcessao: Corredores,    // distribuição típica da liga (neutro)
  clampMin = 0.90, clampMax = 1.12,
): number {
  // peso da concessão do flanco pelo quanto o ataque vai por ali, vs o típico
  const lift = (["esq","centro","dir"] as const).reduce(
    (acc, c) => acc + shareAtaque[c] * (concessaoFlanco[c] / baseConcessao[c]), 0);
  return Math.max(clampMin, Math.min(clampMax, lift));
}
```
**Wire (snake_case PT):** expor no trace/dossiê um campo **legível** análogo a `concedido_posicao`
(ex.: `concedido_flanco: "ataca 58% pela direita; o lado esquerdo do adversário concede 1.3× o típico"`),
para a IA explicar **em palavras** (ela não calcula — só lê). Mantém o padrão de
`src/providers/stats.ts:180` (`positionalNote`).

## 7. Plano de validação
- **Harness de calibração** = reaproveitar `scripts/backtest-tilt.mts` (já faz leave-one-out
  anti-espiada) **trocando o fator** pelo `directionalMultiplier`, e `scripts/measure-positional-baseline.mts`
  como molde para medir as distribuições por corredor. **POR MERCADO**, over 0.5/1.5.
- **Métrica/critério:** ECE **não piora** (idealmente melhora) **e BrierSkill > 0** no mercado, vs o
  μ atual (sem direcional). Ligar **só** os mercados que passam, via flag por-mercado. (Repetir o
  mesmo rigor que reprovou o tilt cru — `src/model/params.ts:16-21`.)
- **Forward (obrigatório):** depois do offline, o loop **I7** confirma na população Copa (Brier/ECE/CLV
  por `market_type`). **NÃO ligar com dinheiro real antes** do offline passar **e** do forward confirmar.

## 8. Riscos & armadilhas
- **ALTO risco de money-path:** mexe no μ → **paridade** (re-freeze consciente das golden) **e** o
  estimador errado **degrada ECE** (já aconteceu: desarmes +10.1%, sot +20.0% — `src/model/params.ts:17-18`).
  **Não repetir o estimador ruidoso.** Suavidade + gate por-mercado são inegociáveis aqui.
- **Orientação de coordenadas desconhecida** (spike do passo 1): se `average_positions` não estiver
  normalizado e a gente assumir que está, o encaixe casa flancos **trocados** → pior que o neutro.
- **Amostra de seleção pequena:** poucos jogos → perfis instáveis → exige shrinkage forte e
  `min_games` (estilo `POSITIONAL_MIN_GAMES=5`, `src/model/params.ts:22`); abaixo disso, **neutro** (1.0).
- **Custo de chamadas:** o perfil de concessão por flanco lê `player-stats` de N jogos do adversário
  (como `teamConcededByPosition` já faz) — caro em chamadas; cachear (`posCache` já existe,
  `src/providers/stats.ts:33`).
- **Fail-closed:** faltou dado (sem `average_positions`, sem `x/y`) → multiplicador **1.0**, nunca
  estimar no escuro (igual ao `positionalTilt` atual, `src/model/adjustments.ts:19`).

## 9. Dependências
- **Spike de orientação de coordenadas** (passo 1) — bloqueante.
- **I7** (loop forward) para confirmar na Copa.
- **N1** (lineup confirmado) — direcional só importa para quem realmente vai jogar naquele flanco.
- Reuso de **N2** (shrinkage) — o estimador direcional usa o mesmo princípio de encolhimento.

## 10. Esforço estimado
**Alto:** ~0.5 dia spike de coords + ~2-3 dias (perfis de ataque/concessão por corredor + função
direcional + flag por-mercado + testes) + ~1-2 dias de harness de calibração por mercado + acúmulo
forward. É o item mais caro do tier — por isso vem por último na ordem.

## 11. Checklist de aceite
- [ ] Spike de coordenadas resolvido e **normalização documentada** (todo time ataca esq→dir).
- [ ] Perfil de ataque por corredor e perfil de concessão por flanco, **ambos encolhidos**, com `min_games`.
- [ ] `directionalMultiplier` puro em `src/model/adjustments.ts`, com teste unitário (fakes, fail-closed → 1.0).
- [ ] Flag **por-mercado** (`DIRECTIONAL_ENABLED`) em `src/model/params.ts`, default OFF.
- [ ] Backtest leave-one-out por mercado: ECE não piora **e** BrierSkill>0 nos mercados ligados.
- [ ] `npm test` verde; golden de `test/parity/` **re-congeladas de propósito** com nota no commit.
- [ ] Campo legível (`concedido_flanco`) no dossiê para a IA explicar (sem número inventado).
- [ ] `docs/ROADMAP.md` / `docs/PITCH.md` atualizados (direcional ligado por mercado, com evidência).

## 12. Como verificar
```bash
# (1) spike de orientação — comparar y de um ponta conhecido em casa vs fora:
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/9099/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>console.log(JSON.stringify(j.average_positions?.home?.slice(0,5))))'

# (2) calibração por mercado (adaptar o fator no script p/ directionalMultiplier):
npx tsx scripts/backtest-tilt.mts

npm test            # paridade re-congelada de propósito; suíte verde
npm run typecheck
```
