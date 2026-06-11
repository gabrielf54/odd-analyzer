# Virada pós-Copa — usar o produto nas ligas de clube (NORTE PERMANENTE)

> **Por que este doc existe (pedido explícito do dono, 2026-06-11):** o produto é
> validado **para a Copa do Mundo 2026 (seleções)** como primeira arena, mas o objetivo
> é **continuar usando depois da Copa, nas ligas nacionais de clube** (Premier, Brasileirão,
> etc.) — **sem seleção**. Este documento mapeia, de forma explícita, o que muda nessa
> virada, para **não criar lock-in só-Copa** e para a próxima sessão executar sem re-investigar.

**Estado:** a fundação anti-lock-in já está no código (2026-06-11, Fatia 0). A virada em si
(operar ligas de clube de verdade) é trabalho **futuro**, condicionado à Copa terminar e/ou ao
dono querer atacar clube antes.

---

## 1. O conceito em uma frase

O modelo **não é o mesmo número para clube e seleção** — seleção joga diferente (mais travado,
mais desigual, chuta a gol menos). Por isso a **validação é ciente de população**: o mesmo
mercado/linha pode valer numa população e não na outra. A virada pós-Copa é **trocar a
população ativa de seleção para clube** — e o código já está preparado para fazer isso
**automaticamente pela liga do jogo**.

## 2. O que muda AUTOMATICAMENTE (já implementado)

`populacaoFor(leagueId)` (`src/model/markets.ts`) é a fonte única de população:
- Liga em `NATIONAL_LEAGUE_IDS` (Copa=27, AFCON/amistoso/quali=31,58-67) → `"selecao"`.
- **Qualquer outra liga — incluindo toda liga de clube — → `"clube"`.** Não precisa cadastrar
  cada liga de clube; o default já é clube.

Consequência: ao analisar um jogo de **liga de clube**, sem mexer em nada:
- O `concede_baseline` de clube entra (via `baselineFor`, que já usa `populacaoFor`).
- O `validated_lines.clube` entra no gate da estrela (`isValidated(market, linha, leagueId)`).
- **SOT 1.5/2.5 voltam a ganhar estrela sozinhos** (clube valida todas as linhas de sot/
  finalizações), porque o aperto `[0.5]` é **só da população seleção**.
- O badge `populacao` no resultado vira `"clube"` e o `populacao_motivo` explica o gate de clube.

**Este é o anti-lock-in:** apertar a seleção (sot só 0.5) **não** travou o clube.

## 3. Estado de validação por população (hoje)

| Mercado | `selecao` (Copa, ativo agora) | `clube` (pós-Copa) | Observação |
|---|---|---|---|
| `finalizacoes` | todas as linhas ✅ | todas as linhas ✅ | transfere limpo (calib 2026-06-11) |
| `sot` | só `0.5` ✅ | todas as linhas ✅ (legado) | clube **a re-confirmar** (Fatia 1) |
| `desarmes` | `0.5`/`1.5` ✅ | **ausente — não validado** | clube **a medir** (Fatia 1) |
| `gols`/`vitoria`/`escanteios` | não validado | não validado | em validação nas duas |

`clube` de sot/finalizações vem da **calibração legada de clube** (~3300 jogos Brasileirão, que
originou o `validated:true`). É evidência real, mas **anterior** ao motor atual (pós minutos-
esperados) → **marcada para re-confirmar antes de operar clube de verdade**.

## 4. CHECKLIST DO PIVÔ (executar antes de operar ligas de clube)

- [ ] **Confirmar que a(s) liga(s) de clube alvo NÃO estão em `NATIONAL_LEAGUE_IDS`** (devem
      cair em `"clube"`). Se alguma liga de clube tiver id que colida, ajustar o set.
- [ ] **Re-confirmar a calibração de clube** (sot/finalizações) com o motor atual — não confiar
      só no legado. Mesma receita da seleção: `scripts/recalibrate-sot-fin-selecao.mts` apontado
      para uma liga de clube do BSD (ex.: a liga 9 já usada no league-sweep). Critério: BrierSkill
      > 0 e ECE aceitável por linha → preencher/confirmar `validated_lines.clube`.
- [ ] **Medir `desarmes.clube`**: rodar a decomposição (`recalibrate-desarmes-decomp.mts`) numa
      liga de clube; o `wr_prior` (aproveitamento won/total) de clube pode diferir de 0.622
      (seleção). Se passar, adicionar `clube: [...]` ao `validated_lines` do desarme.
- [ ] **Revisar o default de liga desconhecida** (`populacaoFor` → "clube"). Pós-Copa, "clube"
      como default já é o certo; só revisitar se aparecer liga ambígua.
- [ ] **Acumular forward de clube** antes de graduar mercado novo: o `paper_ledger` é
      **população-agnóstico** (grava qualquer jogo) — rodar análise + `settle` em jogos de clube
      e medir Brier/ECE/CLV na população clube (o `report` por mercado já existe).
- [ ] **Atualizar as docs vivas** (ROADMAP/PITCH/CLAUDE) marcando os mercados de clube como
      validados conforme passarem — graduação gradual, igual à seleção.

## 5. Mapa de re-validação por mercado (resumo)

- **finalizações:** já validado nas duas; só confirmar forward de clube.
- **sot:** clube herda "todas as linhas" do legado → **re-confirmar** (passo 2 do checklist).
  Se confirmar, sot no clube é o mercado mais forte (linhas altas voltam).
- **desarmes:** clube **do zero** — medir aproveitamento de clube (passo 3). Até lá, sem estrela
  no clube.
- **gols/vitória/escanteios:** seguem em validação nas duas populações; só ligar com prova.

## 6. O que NÃO muda

- O **money-path** (funções puras de `model/`/`value/`) é o mesmo nas duas populações — só os
  **parâmetros** (baseline, validated_lines) diferem por população. O **gate de paridade**
  continua protegendo os números.
- A **forma do jogador** sempre veio majoritariamente do clube (mesmo na Copa). Na virada, a
  forma passa a casar com a população do jogo (clube×clube) — **menos** mistura de populações,
  não mais. Tende a calibrar melhor, não pior.

---

Relacionado: spec `docs/superpowers/specs/2026-06-11-validacao-ciente-populacao-design.md`,
plano `docs/superpowers/plans/2026-06-11-validacao-ciente-populacao.md`,
mapa das próximas fatias `docs/proximos-passos/SESSION-MAP.md`.
