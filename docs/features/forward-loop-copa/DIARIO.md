# 📓 DIÁRIO DE RODADAS — loop forward da Copa

> **Relato humano** das rodadas do loop (append-only: entrada nova **no topo**; não apague as antigas).
>
> ⚠️ **Os DADOS de verdade NÃO ficam aqui** — ficam no banco (tabela `paper_ledger` no Supabase). É o
> "caderninho" real, sempre atualizado; o comando 4 (`report.ts`) lê dele. Este diário é só pra você
> **acompanhar a história** sem abrir o banco: o que rodou, quando, e o que o boletim disse. **Uma
> entrada curta por sessão basta** — não copie tabelão do banco aqui (apodrece).

### Modelo de entrada (copie e preencha)
```
### AAAA-MM-DD (período) — quem rodou
- comandos: quais rodou (1 / 2 / 3 / 4)
- entrou: ex. 72 previsões em 12 jogos
- boletim (se rodou o 4): o "n" de cada mercado + o que chamou atenção
- pendente: ex. fechamento dos jogos da noite
```

---

### 2026-06-16 (manhã, ~13h) — Claude (a pedido do dono)
- **comando 1** rodado (~12h58, antes das escalações → abertura "limpa").
- **entrou:** 72 previsões em 12 jogos (gols 1.5/2.5/3.5 + vitória mandante/empate/visitante), **todas
  com preço de abertura travado**.
- **observação (a TESTAR, não é aposta):** o modelo segue fadando favorito — vê valor no azarão/empate
  (ex. France×Senegal ~+18pp no Senegal; Iraq×Norway fada a Noruega com força).
- **pendente hoje:** comando **2** (fechamento) ~15h30 / 18h30 / 21h30; comandos **3** e **4** à noite.

### 2026-06-15 (tarde) — Claude
- **Fase 2 (CLV) ligada** (1ª vez que o loop anexa odd + de-vig + edge). Run: 48 previsões, 4/4 com odd.
- **boletim:** gols n=46 (BrierSkill +0.128 — melhor que a média); vitória n=21 em amostra ainda
  contaminada pelo modelo antigo.
- detalhe técnico/verdito no [README.md](README.md) §"Estado atual".
