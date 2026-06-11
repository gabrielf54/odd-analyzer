# Spec — Validação ciente de população (anti-lock-in) + virada pós-Copa

**Data:** 2026-06-11 · **Fatia 0** da session "produto validado p/ Copa SEM lock-in só-Copa".
**Aprovado pelo dono:** sequência da session + abordagem 1 (mapa por população no `MarketSpec`).

> Esta é a **fatia fundação**. As demais (1=calibrar clube · 2=I3 novos mercados · 3=N2 ·
> 4=N5 · 5=I6 · 6=arbitro_tendencia) assentam nela e têm spec própria. I2/I4/nota_confronto
> seguem **bloqueados por dado** (BSD sem posicional/xG); N4 **removido** (decisão do dono).

---

## 1. TL;DR

O trinco `validated_lines` hoje é **global por mercado** — o mesmo número vale pra seleção e
pra clube. Isso cria **lock-in ao contrário**: ao apertar `sot=[0.5]` (correto p/ seleção,
onde chute a gol alto não tem skill) eu **travaria o SOT 1.5/2.5 também pro clube**, onde ele
**presta** (atacante de clube finaliza muito). Esta fatia torna a validação **ciente de
população** (seleção × clube), roteada **automaticamente pela liga** do jogo, e **documenta de
forma explícita a virada pós-Copa** pra ligas de clube — objetivo declarado do dono: usar o
produto **depois** da Copa, **sem seleção**.

## 2. Contexto e motivação

- **Objetivo do dono (citado):** "preciso desse produto validado pra Copa... não quero lock-in
  só-Copa, depois quando a Copa acabar pretendo usar pra ligas nacionais."
- O motor **já distingue população** no baseline de concessão: `baselineFor(leagueId)` usa
  `NATIONAL_LEAGUE_IDS` (`src/model/markets.ts`) p/ escolher `concede_baseline_nacional` vs
  `concede_baseline`. **Esta fatia espelha esse padrão** no gating de validação — não inventa
  conceito novo.
- A calibração na seleção (n=2071, `scripts/recalibrate-sot-fin-selecao.mts`) provou:
  **finalizações transfere todas as linhas; SOT só presta em 0.5**. A calibração **legada de
  clube** (~3300 jogos Brasileirão, histórico) validava **sot/finalizações em todas as linhas**.
  Logo os dois números são **legítimos — em populações diferentes**. O gating precisa carregar
  os dois.

## 3. Decisão de arquitetura (abordagem 1 — aprovada)

**`validated_lines` vira um mapa por população** no `MarketSpec`:

```ts
type Populacao = "selecao" | "clube";
// Semântica por população:
//   chave AUSENTE        → NÃO validado nessa população (sem estrela).
//   array VAZIO []        → validado em TODAS as linhas.
//   array [a, b]          → validado SÓ nessas linhas.
validated_lines?: Partial<Record<Populacao, number[]>>;
```

Substitui o par atual `validated: boolean` + `validated_lines?: number[]`. (Migração: §6.)

**Roteamento — `isValidated(marketType, linha, leagueId)`:**

```
pop = NATIONAL_LEAGUE_IDS.has(leagueId) ? "selecao" : "clube"
     // leagueId desconhecido/ausente → "clube" (REVISADO no plano: roteador ÚNICO
     //   consistente com baselineFor; liga de clube nova cai em clube sem cadastro,
     //   servindo o pós-Copa. Durante a Copa o league_id é sempre 27, então o default
     //   não é exercido na prática). Antes a spec dizia "selecao"; ver plano Task 6.
     //   e seleção é o conjunto MAIS restrito → menos estrela falsa). Ver §7 (virada).
lines = market.validated_lines?.[pop]
se lines === undefined            → false   // não validado nessa população
se lines.length === 0             → true    // todas as linhas
senão                             → linha != null && lines.includes(linha)
```

`rankCandidates` **já recebe a liga** no candidato (o fio carrega `league_id`); passa o
`leagueId` ao `isValidated`. **Quem decide a população é o código, pela liga — nunca o usuário**
(flag manual foi descartada: redundante e pode marcar errado → estrela falsa).

## 4. Valores por população (estado honesto desta fatia)

| Mercado | `selecao` | `clube` | Fonte |
|---|---|---|---|
| `sot` | `[0.5]` | `[]` (todas) | seleção: calib 2026-06-11 (1.5/2.5 reprovam) · clube: legado Brasileirão |
| `finalizacoes` | `[]` (todas) | `[]` (todas) | ambos validados (transfere limpo) |
| `desarmes` | `[0.5, 1.5]` | *(ausente — não validado)* | seleção: decomposição (won_tackle); clube **a confirmar na Fatia 1** |
| `gols`/`vitoria`/`escanteios` | *(ausente)* | *(ausente)* | em validação nas duas |

**Honestidade (não auto-engano):**
- `clube` de `sot`/`finalizações` parte da **evidência legada** (calibração Brasileirão que
  originou o `validated:true`), marcada p/ **re-confirmar na Fatia 1** (re-rodar a calibração de
  clube com o motor atual, pós-minutos-esperados). Não é número inventado — é evidência prévia
  real, sinalizada como "a re-verificar".
- `desarmes.clube` fica **ausente (não validado)**: a decomposição tem `wr_prior=0.622`
  (aproveitamento médio) medido **na seleção**; clube pode diferir → só valida após Fatia 1.
  Conservador é não dar estrela até medir.

## 5. Badge de população (transparência, fora do money-path)

O resultado da análise passa a carregar (snake_case PT, no fio):
- `populacao: "selecao" | "clube"` — derivado da liga.
- `populacao_motivo: string` — texto leigo p/ a IA/front citarem (ex.: "Jogo de seleção: chutes
  a gol só validam em 1+; linhas altas seguem analisadas, sem estrela").

**Texto, não toca `prob_modelo`/edge → paridade intacta.** O front mostra um selo + a razão de
uma linha não ter estrela. Resolve o "te serve?" do dono sem flag manual.

## 6. Migração (call sites)

- `MarketSpec`: remove `validated: boolean` e `validated_lines?: number[]`; adiciona
  `validated_lines?: Partial<Record<Populacao, number[]>>`. Atualiza o helper `spec()`.
- `isValidated(marketType, linha)` → `isValidated(marketType, linha, leagueId)`. **Todos os
  call sites** passam a liga (principal: `rankCandidates` em `src/candidates/rank.ts`).
- Onde a liga não chega hoje, propagar pelo candidato (`league_id` já existe no dossiê).
- Testes: `test/rank.test.ts`, `test/markets.test.ts` — cobrir os dois roteamentos.

## 7. Doc da virada pós-Copa (ENTREGÁVEL OBRIGATÓRIO — pedido explícito do dono)

Criar **doc dedicado** `docs/pos-copa-ligas-nacionais.md` + seção no `ROADMAP.md` + parágrafo
leigo no `PITCH.md`. Conteúdo:

1. **Objetivo:** ao fim da Copa, operar o produto em **ligas de clube** (sem seleção).
2. **O que MUDA automaticamente:** jogos de liga de clube **não** estão em `NATIONAL_LEAGUE_IDS`
   → o motor já roteia p/ `populacao="clube"` → aplica `concede_baseline` de clube e
   `validated_lines.clube`. **SOT 1.5/2.5 re-abrem sozinhos** (clube valida todas as linhas).
3. **Checklist do pivô (explícito):**
   - [ ] Confirmar que a(s) liga(s) de clube alvo **não** caíram em `NATIONAL_LEAGUE_IDS`.
   - [ ] **Re-confirmar a calibração de clube** (Fatia 1) com o motor atual antes de operar —
         não confiar só no legado.
   - [ ] Medir `desarmes.clube` (decomposição com `wr_prior` de clube) → preencher
         `validated_lines.clube`.
   - [ ] Revisar o **default de liga desconhecida** (§3): cai em `clube` (REVISADO — ver plano);
         pós-Copa isso já é o certo. Só revisitar se aparecer liga ambígua.
   - [ ] Acumular **forward de clube** (paper_ledger já é população-agnóstico) antes de graduar.
4. **Mapa de re-validação por mercado** (qual linha re-abre, o que medir).

Marcar no ROADMAP como **norte permanente**, não como follow-up que pode evaporar.

## 8. Remoção do N4

Remover a ficha `docs/proximos-passos/tiers/tier-1-precisao-segura/N4-odds-bsd-mercado-partida.md`
do fluxo: marcar como **DESCARTADO (decisão do dono 2026-06-11)** no README do tier e no
proximos-passos/README.md (não apagar o histórico — banner de descartado).

## 9. Plano de validação

- **Testes Vitest** (`isValidated` por população):
  - seleção (liga 27/31/58-67): `sot 0.5`=true, `sot 1.5`=false, `finalizações 2.5`=true,
    `desarme 1.5`=true.
  - clube (liga 9 ou qualquer fora do set): `sot 1.5`=true, `sot 2.5`=true, `desarme 1.5`=false
    (ausente).
  - liga desconhecida/ausente → rota clube (REVISADO — roteador único; ver plano).
- **Paridade intacta** (não toca o número): golden de `test/parity/` inalteradas; `npm test`
  verde; `npm run typecheck` limpo.
- **Critério de aceite:** suíte verde (≥ 273 + novos testes); o E2E manual num jogo da Copa
  mostra o badge `populacao="selecao"` e SOT 1.5 **sem** estrela; um jogo de clube mostraria SOT
  1.5 **com** estrela (teste unitário cobre, já que não temos jogo de clube ao vivo agora).

## 10. Riscos & armadilhas

- **Não afirmar validação de clube sem evidência atual:** `clube` de sot/finalizações usa o
  legado — **marcado p/ re-confirmar (Fatia 1)**. Documentar como "herdado, a re-verificar".
- **Default de liga desconhecida** cai em clube (REVISADO — roteador único). Documentado e no
  checklist do pivô.
- **Paridade:** o gate testa funções puras com `mu` hardcoded — mudar gating **não** o toca
  (mesma descoberta do desarme). Confirmar mesmo assim.
- **Call sites do `isValidated`:** garantir que TODOS passam `leagueId`; um esquecido cairia no
  default seleção silenciosamente. Typecheck pega a assinatura nova.

## 11. Fora de escopo (desta fatia)

Calibração de clube (Fatia 1), novos mercados (I3), N2/N5/I6/arbitro. I2/I4/nota_confronto
bloqueados por dado. Mudança de `nb_dispersion` (o R≈2.0 da seleção) — follow-up separado.

## 12. Checklist de aceite

- [ ] `MarketSpec.validated_lines` é mapa por população; `spec()` atualizado.
- [ ] `isValidated(market, linha, leagueId)` roteia por `NATIONAL_LEAGUE_IDS`; default clube.
- [ ] `rankCandidates` passa a liga; demais call sites idem.
- [ ] Valores da §4 aplicados (sot seleção [0.5]/clube todas; desarme clube ausente).
- [ ] `populacao` + `populacao_motivo` no fio do resultado (texto, fora do número).
- [ ] Doc `docs/pos-copa-ligas-nacionais.md` + seção ROADMAP + PITCH leigo (virada explícita).
- [ ] N4 marcado DESCARTADO (banner, sem apagar histórico).
- [ ] Testes por população verdes; paridade intacta; typecheck limpo.
- [ ] Docs vivas (CLAUDE/ROADMAP/PITCH/proximos-passos) coerentes.
