# 🟢 MANUAL — rodar o "loop da Copa" (pro dono, linguagem simples)

> Guia pra **você** rodar sozinho, sem entender de código. Tudo em **horário de Brasília**.
> O detalhe técnico fica no [README.md](README.md) (esse é pro Claude).

## O que é (uma frase)

São **4 comandos** que enchem um caderninho de apostas **no papel** (zero dinheiro) pra provar, ao
longo da Copa, se o modelo é bom de verdade. Você só **cola os comandos** nos horários certos.

---

## ⏰ A ROTINA DE UM DIA DE JOGOS

Os jogos da fase de grupos quase sempre caem em **blocos de horário**: ~13h, 16h, 19h e 22h (BRT).
Sua rotina é simples:

| Quando (horário de Brasília) | Comando | O que faz |
|---|---|---|
| 🌅 **De manhã** (até umas 12h) | **1** | anota os jogos do dia e **trava o preço de abertura** |
| ☀️ **Início da tarde** (~13–14h) | **2** | pega o preço **final** dos jogos da tarde |
| 🌆 **Início da noite** (~18–19h) | **2** de novo | pega o preço final dos jogos da noite |
| 🌙 **Antes de dormir** (ou no dia seguinte de manhã) | **3** e **4** | marca quem ganhou + mostra o boletim |

**Regra de bolso:** o comando **2** é o único com hora marcada (perto dos jogos). Rodar ele 2x
(tarde e noite) cobre o dia todo. Pode repetir à vontade — ele não duplica, só pega os jogos que
estão **perto de começar**. Se um dia você só conseguir 1 vez, rode **1 → 3 → 4** (perde só a prova
do "comprei barato" daquele dia, o resto continua).

> Dica preguiçosa: me diga **"roda a Copa"** a qualquer hora que eu disparo os 4 e te explico.

---

## 📅 CALENDÁRIO REAL — fase de grupos (horário de Brasília)

> Os jogos com placar já aconteceram. A partir de **16/06** é o que vem.

**qui 11/06** — 16h Mexico×South Africa · 23h South Korea×Czechia
**sex 12/06** — 16h Canada×Bosnia · 22h USA×Paraguay
**sáb 13/06** — 16h Qatar×Switzerland · 19h Brazil×Morocco · 22h Haiti×Scotland
**dom 14/06** — 01h Australia×Türkiye · 14h Germany×Curaçao · 17h Netherlands×Japan · 20h Côte d'Ivoire×Ecuador · 23h Sweden×Tunisia
**seg 15/06** — 13h Spain×Cabo Verde · 16h Belgium×Egypt · 19h Saudi Arabia×Uruguay · 22h Iran×New Zealand

**ter 16/06** — 16h France×Senegal · 19h Iraq×Norway · 22h Argentina×Algeria
**qua 17/06** — 01h Austria×Jordan · 14h Portugal×DR Congo · 17h England×Croatia · 20h Ghana×Panama · 23h Uzbekistan×Colombia
**qui 18/06** — 13h Czechia×South Africa · 16h Switzerland×Bosnia · 19h Canada×Qatar · 22h Mexico×South Korea
**sex 19/06** — 16h USA×Australia · 19h Scotland×Morocco · 21h30 Brazil×Haiti
**sáb 20/06** — 00h Türkiye×Paraguay · 14h Netherlands×Sweden · 17h Germany×Côte d'Ivoire · 21h Ecuador×Curaçao
**dom 21/06** — 01h Tunisia×Japan · 13h Spain×Saudi Arabia · 16h Belgium×Iran · 19h Uruguay×Cabo Verde · 22h New Zealand×Egypt
**seg 22/06** — 14h Argentina×Austria · 18h France×Iraq · 21h Norway×Senegal
**ter 23/06** — 00h Jordan×Algeria · 14h Portugal×Uzbekistan · 17h England×Ghana · 20h Panama×Croatia · 23h Colombia×DR Congo
**qua 24/06** — 16h Switzerland×Canada · 16h Bosnia×Qatar · 19h Scotland×Brazil · 19h Morocco×Haiti · 22h South Africa×South Korea · 22h Czechia×Mexico
**qui 25/06** — 17h Ecuador×Germany · 17h Curaçao×Côte d'Ivoire · 20h Japan×Sweden · 20h Tunisia×Netherlands · 23h Türkiye×USA · 23h Paraguay×Australia
**sex 26/06** — 16h Senegal×Iraq · 16h Norway×France · 21h Cabo Verde×Saudi Arabia · 21h Uruguay×Spain
**sáb 27/06** — 00h New Zealand×Belgium · 00h Egypt×Iran · 18h Croatia×Ghana · 18h Panama×England · 20h30 DR Congo×Uzbekistan · 20h30 Colombia×Portugal · 23h Jordan×Argentina · 23h Algeria×Austria

> ⚠️ Nos últimos dias de grupo (24–27/06) os jogos da mesma chave são **no mesmo horário** — rode o
> comando **2** um pouco antes de cada bloco pra não perder nenhum.

## 📅 Mata-mata (datas reais; os times só se sabem na hora)

- **28/06 a 03/07** — 16 avos (primeira rodada eliminatória)
- **04/07 a 07/07** — oitavas
- **09/07 e 10/07** — quartas
- **14/07 e 15/07** — semifinais
- **18/07** — disputa de 3º lugar · **19/07** — **FINAL**

Nessa fase os jogos são mais espaçados (1–4 por dia). Mesma rotina; é só rodar nos dias que tiver jogo.

---

## 💻 COMO rodar (passo a passo)

1. Abra o **terminal** na pasta do projeto (`odd-analyzer`).
2. **Cole** o comando, aperte Enter. Um de cada vez.

```bash
# 1) de manhã — ANOTA os jogos do dia + trava o preço de abertura
npx tsx src/cli/forwardLog.ts

# 2) perto dos jogos (tarde e noite) — pega o preço FINAL
npx tsx src/cli/snapshotClosing.ts

# 3) depois dos jogos — marca quem GANHOU
npx tsx src/cli/settle.ts

# 4) quando quiser — mostra o BOLETIM
npx tsx src/cli/report.ts
```

Não precisa decorar: volte aqui e copie.

---

## 🔎 O que olhar no boletim (comando 4)

Uma linha por tipo de aposta (gols, vitória...). A coluna que **você** olha é a primeira de número:
**`n`** = quantos jogos já entraram.

- **`n` abaixo de ~30** = cedo, os números balançam (sorte/azar). **Ignore.**
- **`n` chegando a ~30** num tipo → **me chame**: eu leio as outras colunas (as "notas da prova") e
  digo se aquela aposta está pronta pra virar recomendação de verdade.

Você **não precisa** entender Brier/ECE/CLV — isso é comigo. Seu papel é **encher o caderninho**.

## 📣 Quando me chamar

- Um tipo de aposta passou de **~30 jogos** → "lê o boletim pra mim".
- Apareceu **erro vermelho** ao rodar → me mande o texto.
- A qualquer hora: **"roda a Copa"** → eu disparo os 4 e explico em português simples.

## 🎯 O que estamos caçando

Além de provar gols e vitória, uma fisgada: na Copa o mercado parece **pagar caro demais no
favorito**. O loop agora anota **mandante, empate E azarão** de cada jogo — pra ver se "apostar
contra o favorito" dá lucro no papel. Só observar; daqui a umas semanas (quando `n` crescer) o
boletim conta.
