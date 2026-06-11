# ⚫ Tier X — Fora de escopo agora (documentado para não re-tentar à toa)

> **Para que serve este tier:** estas fichas **NÃO devem ser trabalhadas agora**. Cada uma já foi
> investigada e descartada (ou confirmada como "já está certo, não mexer"). Documentamos o **porquê**
> e o **gatilho exato para reabrir**, para que uma sessão futura **não gaste tempo re-investigando**
> nem "conserte" o que já está correto. Se você abriu este tier procurando algo para fazer **hoje**,
> está no tier errado — vá para o [Tier 0](../tier-0-pre-requisitos/) (pré-requisitos antes de apostar).

**Criado em:** 2026-06-11 (dia de abertura da Copa). **Base factual:** sondagem real da BSD + leitura do código.

---

## Por que existe um tier "fora de escopo"

Uma boa documentação de próximos passos não lista só o que **fazer** — lista também o que **decidimos
não fazer e por quê**. Sem isso, toda sessão nova re-descobre as mesmas paredes:

- **I4 (xG no μ)** parece uma melhoria óbvia ("usar o chute sem ruído em vez da contagem crua"), mas
  o dado **não vem para seleção** — a sondagem provou. Sem este registro, alguém vai tentar de novo,
  bater no `NULL`, e perder uma tarde.
- **N3 (escopo histórico clube+seleção)** parece um "bug" a corrigir ("estamos misturando populações"),
  mas o default `"todos"` **já é a decisão certa** (maximiza amostra). Sem este registro, alguém vai
  "consertar" para `"selecao"`, reduzir a amostra a ~3 jogos e **piorar** o produto.

Em ambos os casos o trabalho certo agora é **zero** — mas o registro do **gatilho de reabertura** vale
ouro: quando o mundo mudar (a Copa ao vivo trouxer xG; a prova forward mostrar erro sistemático em
seleção), a próxima sessão sabe exatamente o que verificar para reabrir.

---

## As fichas deste tier

| Ficha | O que é | Status | Gatilho para reabrir |
|---|---|---|---|
| [I4 — xG/xA do jogador no μ](I4-xg-no-mu.md) | Usar `expected_goals`/`expected_assists` para de-noisar o μ de sot/finalizações | ❌ **Fora de escopo** — `expected_goals` vem `NULL` em seleção (0/46 no event 9099) | Um jogo da Copa (liga 27) **já finalizado** trazer `expected_goals` preenchido nos player-stats |
| [N3 — Escopo histórico (clube+seleção)](N3-escopo-historico.md) | Filtrar a forma do jogador por clube/seleção/todos | ✅ **Já é a decisão certa** — `"todos"` é o default e deve ser **mantido** | Prova forward (I7) mostrar que μ de forma-de-clube **erra sistematicamente** em seleção |

---

## Princípios que sustentam estas decisões (do `CLAUDE.md` / README raiz)

Por que "não fazer agora" é a resposta **disciplinada**, não preguiça:

1. **Validação-primeiro.** Ideia que **não dá para validar** não entra no money-path. I4 não pode ser
   validado offline na população Copa (Copas passadas têm player-stats vazio) **e** não pode rodar ao
   vivo (xG ausente em seleção) → fora. N3, se mudado para `"selecao"`, não teria amostra para validar.
2. **Não filtrar por "probabilidade alta" / não inventar número.** Nenhuma destas fichas muda esse
   princípio; ambas o respeitam (são sobre o **insumo** do μ, não sobre o critério de valor nem sobre a IA).
3. **Gate de paridade 1e-9.** I4 mudaria o μ → quebraria as golden EPL e exigiria recalibração completa.
   Custo alto **sem** ganho validável agora = decisão fácil de adiar.
4. **Custo de dado ~$0.** Nenhuma destas fichas justifica gasto novo; o limite é o que a BSD já dá — e
   ela **não dá** xG de seleção.

---

## Como reabrir uma ficha (quando o gatilho disparar)

1. **Confirme o gatilho com evidência real** (rode o comando de verificação da ficha — não suponha).
2. Se confirmado, a ficha **sai do Tier X** e entra no tier correto pela ajuda-à-meta/risco
   (I4 reaberto provavelmente cairia no Tier 2 — diferencial, por exigir recalibração).
3. Siga o fluxo normal: `superpowers:brainstorming` → `writing-plans` → `test-driven-development`,
   respeitando o gate de paridade e o plano de validação da própria ficha.
4. **Atualize a doc viva** (`docs/ROADMAP.md` e `docs/PITCH.md`) e mova a ficha de tier no
   [README raiz](../../README.md#4-os-tiers-ordem-de-ataque).
