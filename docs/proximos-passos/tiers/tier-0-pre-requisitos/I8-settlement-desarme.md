# I8 — Settlement do desarme (`won_tackle` vs `total_tackle`)

## 1. TL;DR
O motor modela **`total_tackle`** (desarmes tentados). A BSD também entrega **`won_tackle`** (desarmes
ganhos). Se a casa de apostas liquida "desarmes" por uma definição diferente da nossa, **toda** aposta
de desarme (o carro-chefe) mira o alvo errado. Verificar a definição da casa e alinhar modelo + settle.

## 2. Status
- **Ajuda à meta:** **Alto** (desarmes é o mercado mais usado/forte; um desalinhamento contamina tudo).
- **Pronto p/ Copa:** ✅ Sim (a verificação é imediata).
- **Esforço:** Baixo para verificar; **Médio** se precisar trocar o stat (recalibração + paridade).
- **Risco de calibração/paridade:** Baixo se a casa = `total_tackle`; **Médio/Alto** se for `won_tackle`
  (trocar `stat_field` muda o μ → quebra golden EPL → re-congelar + recalibrar).
- **Custo de dado:** $0 (ambos os campos já vêm no `/events/{id}/player-stats/`).

## 3. Problema / fundamento
Uma odd de "over 2.5 desarmes do Rice" só faz sentido se **o número que nós modelamos** e **o número
que a casa usa para pagar** forem a mesma coisa. "Desarme" tem (pelo menos) duas definições no dado
Opta/BSD: **tentados** (`total_tackle`) e **ganhos** (`won_tackle`). Bater a casa em props já é difícil
(margem 7-10%, settlement Opta); apostar contra uma definição errada é perder de graça — o edge medido
é fantasma porque compara maçã (nosso tentado) com laranja (o ganho que a casa paga).

## 4. Evidência real
- `src/model/markets.ts:35` — mercado `desarmes` usa `stat_field: "total_tackle"`.
- Sondagem do player-stats (amistoso 9099 e clube 7166): cada jogador traz **`total_tackle` E
  `won_tackle`** (campos distintos). Ex.: um jogador com `total_tackle: 2, won_tackle: 2`; outros
  divergem (tentou mais do que ganhou). A diferença é real e material em algumas linhas.
- `concedido_adversario` do desarme usa o campo de **time** `total_tackles` (`src/providers/stats.ts:15`,
  mapa `TEAM_STAT_FIELD`) — também a definição "total", não "won". Coerência interna existe; falta
  alinhar com a **casa**.

## 5. Estado atual no código
- `src/model/markets.ts:35-38` — `desarmes`: `stat_field: "total_tackle"`, `eixo_concessao:
  "desarmes_concedidos_por_jogo"`, baselines `concede_baseline: 14.64`, `concede_baseline_nacional: 13.97`.
- `src/providers/stats.ts:14-19` — `TEAM_STAT_FIELD.total_tackle = "total_tackles"` (concessão de time).
- O settle do **I7** vai ler o mesmo `stat_field` de `MARKETS` para apurar `resultado` — então
  **modelo e settle já são consistentes entre si**; a única pergunta aberta é se batem com a **casa**.

## 6. Proposta de implementação
**Passo 1 — verificar a definição da casa (sem código).**
- Qual casa o dono usa? (definir.) Ler as **regras do mercado** "Player Tackles"/"Desarmes" dessa casa.
  Casas com settlement Opta costumam usar **tackles (tentados)**, mas há exceções por "tackles won".
- Verificação empírica: pegar **uma aposta de desarme já liquidada** (resultado conhecido pela casa) e
  comparar com `total_tackle` vs `won_tackle` do mesmo jogador/jogo no `/events/{id}/player-stats/`.
  O campo que reproduz o pagamento da casa é a definição correta.

**Passo 2 — alinhar.**
- **Se casa = `total_tackle`:** nada a mudar no modelo. Só **documentar** a confirmação e garantir
  que o **settle do I7** use `total_tackle`. ✅ (caminho barato)
- **Se casa = `won_tackle`:**
  1. Settle do I7 deve apurar `resultado` por `won_tackle`.
  2. O modelo deveria modelar `won_tackle` → trocar `stat_field` (ou criar mercado paralelo
     `desarmes_ganhos`). Isso **muda o μ** → **recalibrar** priors/baselines e **re-congelar as golden
     de paridade** (hoje EPL com `total_tackle`). Atualizar `TEAM_STAT_FIELD` para o campo de time
     equivalente (verificar se `/stats/` time tem "tackles won" útil — a sondagem do 7166 mostrou
     `tackles_won` mas com valor suspeito de **percentual** (75), não contagem → cuidado, validar).

**Ports & Adapters / paridade:** se trocar o stat, é mudança de money-path → seguir o protocolo de
calibração (ficha N2/Tier 2 e o `CLAUDE.md`): medir Brier/ECE/leave-one-out, re-congelar golden de
propósito, documentar no ROADMAP.

## 7. Plano de validação
- **Verificação (Passo 1):** o campo escolhido reproduz ≥ N apostas liquidadas conhecidas. Critério:
  bate em 100% dos casos testados (é definição, não estatística — tem que casar exato).
- **Se trocar o stat:** recalibração offline em jogos de seleção recentes (amistosos/eliminatórias,
  já que Copa passada está vazia) — Brier/ECE não pioram vs `total_tackle`; golden re-congeladas de propósito.

## 8. Riscos & armadilhas
- **`tackles_won` de time vem como percentual** no `/stats/` (sondagem 7166: `tackles_won: 75` com
  `total_tackles: 12`) — **não** é contagem; não usar como eixo de concessão sem validar.
- Trocar `stat_field` **quebra o gate de paridade** (esperado) → re-congelar conscientemente, nunca
  silenciosamente.
- Não assumir que todas as casas usam a mesma definição: documentar **por casa** se o dono usar mais de uma.

## 9. Dependências
Nenhuma para verificar. Se trocar o stat: depende do protocolo de recalibração (Tier 2 / N2).

## 10. Esforço estimado
Baixo (verificar: ~1-2h). Médio se precisar trocar o stat (recalibração + re-freeze de paridade: ~1 dia).

## 11. Checklist de aceite
- [ ] Documentado, por casa, se "desarmes" liquida `total_tackle` ou `won_tackle`.
- [ ] O **settle** do I7 usa a mesma definição da casa.
- [ ] Se mudou o stat do modelo: golden de paridade re-congeladas de propósito + recalibração registrada + ROADMAP atualizado.
- [ ] `npm test` verde.

## 12. Como verificar
```bash
# comparar total_tackle vs won_tackle de um jogo finalizado (usa BZZOIRO_API_KEY do .env):
node -e 'fetch("https://sports.bzzoiro.com/api/v2/events/7166/player-stats/",{headers:{Authorization:"Token "+process.env.BZZOIRO_API_KEY}}).then(r=>r.json()).then(j=>j.player_stats.slice(0,8).forEach(p=>console.log(p.player_id,"total=",p.total_tackle,"won=",p.won_tackle)))'
```
Depois, cruzar com o resultado de uma aposta de desarme já liquidada na casa do dono.
