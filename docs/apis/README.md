# APIs — valor e investimento (índice)

Uma ficha por API em `docs/apis/<api>.md`. Este índice **não cresce**: cada API nova é um arquivo novo + uma linha aqui.

Critério de impacto (1-10): quanto o dado destrava a meta — achar **valor (EV)** em odds de **Shots on Target (SOT)** por jogador —, **descontando** alternativa grátis. Insumos do produto: **(1) odds SOT** · **(2) stats** · **(3) escalação/minutos** · **(4) persistência**.

## Scorecard

| API | Insumo | Impacto | Menor tier útil | Preço | Ficha |
|-----|--------|:------:|-----------------|-------|-------|
| API-Football | stats + escalação (2/4) | **9/10** | Pro | **$19/mês** | [api-football.md](api-football.md) |
| SportsGameOdds | odds SOT da bet365 | **8/10** | Pro | **$299/mês** | [sportsgameodds.md](sportsgameodds.md) |
| The Odds API | odds SOT (casas US) | **3/10** | Free | $0 | [the-odds-api.md](the-odds-api.md) |
| Supabase | persistência | **3/10** | Free | $0 | [supabase.md](supabase.md) |

## Ordem de investimento
1. **API-Football Pro — $19/mês.** Barato e essencial; destrava operar a Copa. Pagar ~1 semana antes (~11/jun).
2. **Supabase Free — $0.** Subir p/ Pro ($25) só quando o `paper_ledger` justificar backup gerido.
3. **SGO Pro — $299/mês.** Caro; é o que fecha o loop de EV (bet365). Só com edge já provado; assinar mensal pontual.

**Caminho mais barato:** validar tese = **$0** (tudo free) · operar Copa ao vivo = **$19/mês** · apostar na bet365 = **~$343/mês**.

## Riscos cruzados (valem p/ +de uma API)
- **Mismatch de settlement:** SOT da API-Football (feed possível não-Opta) pode ≠ Opta-FIFA da bet365 → **edge ilusório**. Calibrar antes de apostar.
- **Timing de props:** casas postam SOT perto do kickoff → poll próximo ao jogo. *(SGO + The Odds API)*
- **Armadilha `/odds`:** o `/odds` da API-Football é 1X2/totais, **não** player props. Não substitui SGO.

## Adicionar uma API nova
1. Criar `docs/apis/<nome>.md` a partir do mesmo esqueleto das fichas (headline · papel · tiers · free dá/nega · menor tier · impacto+justificativa · riscos · fontes).
2. Adicionar 1 linha no Scorecard acima e, se mudar prioridade, reordenar a lista de investimento.
3. Regra do impacto: **9-10** essencial sem alternativa grátis · **5-7** essencial mas substituível/barato · **1-4** commodity ou falha no caso central.
