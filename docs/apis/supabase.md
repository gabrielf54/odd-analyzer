# Supabase — impacto 3/10

> Pesquisa: 2026-06-02. Confirmar preço na fonte antes de pagar. Índice: [README.md](README.md).

**Headline:** persistência Postgres completa já no Free ($0, 500 MB, pausa após 7 dias mas recuperável); impacto baixo porque armazenamento é commodity com alternativas grátis (SQLite/Neon) e não é o que destrava valor em SOT.

**Papel:** camada de persistência (Postgres gerenciado) p/ odds capturadas, stats de jogador, crosswalk de identidade entre fontes, e o `paper_ledger` de validação de EV/edge.

## Tiers

| Tier | Preço | Destrava (relevante) | Limites |
|------|-------|----------------------|---------|
| **Free** | **$0** | Postgres completo (SQL/RLS/REST/Realtime/Auth) | 500 MB DB, 5 GB egress/mês, **pausa após 7 dias** sem query, sem backup, 2 projetos ativos |
| Pro | $25/mês | **Nunca pausa** + backups diários (7d) + 8 GB disco + crédito compute $10 | 250 GB egress |
| Team | $599/mês | + retenção 14d, SSO, audit logs | overkill p/ uso pessoal |

**Free dá:** Postgres gerenciado completo — mais que suficiente p/ persistir odds/stats/crosswalk/ledger de 1 usuário; 500 MB comportam milhões de linhas; 5 GB egress sobra.
**Free nega:** backups automáticos (zero — risco p/ o `paper_ledger`); e **não mantém o projeto ligado**: pausa após 7 dias sem query (religa em ~30s, recuperável).

**Menor tier para o produto:** **Free ($0)** basta p/ validação e uso pessoal contínuo. Pro ($25) só se quiser backup diário gerido do ledger ou garantia de nunca pausar p/ jobs agendados.

**Impacto 3/10:** persistência é necessária mas **não** é o gargalo que decide se o produto acha valor (isso depende de odds e escalação). É commodity com várias alternativas grátis equivalentes (SQLite/DuckDB local, Postgres em Docker, Neon free). O valor real aqui é conveniência (REST automática, dashboard), não diferencial de EV.

## Riscos
- Pausa automática após 7 dias sem query no Free — mitigar com cron diário de ping; fora da Copa (jogos esparsos) o risco sobe.
- Free sem backups: perda/corrupção do `paper_ledger` é irrecuperável sem `pg_dump` agendado externo.
- Limite de 2 projetos ativos no Free (pausados não contam).
- 500 MB / 5 GB egress são folgados p/ 1 usuário, mas snapshots de odds de muitas casas ao longo de temporadas crescem — limpar dados antigos.
- PITR **não** está incluso nem no Pro base (add-on pago).
- Cold start ~30s ao religar projeto pausado pode atrasar job que roda perto do horário do jogo.

## Fontes
- https://supabase.com/pricing
- https://supabase.com/docs/guides/platform/billing-on-supabase
