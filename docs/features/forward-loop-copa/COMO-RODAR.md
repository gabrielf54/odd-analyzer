# 🟢 Como rodar o "loop da Copa" — guia simples (pro dono)

> Este guia é pra **você** rodar sozinho, sem precisar entender código. É linguagem do dia a dia.
> O detalhe técnico fica no [README.md](README.md) (esse é pro Claude).

## O que é (uma frase)

São **4 comandos** que enchem um caderninho de apostas **no papel** (sem dinheiro nenhum) pra
provar, ao longo da Copa, se o nosso modelo é bom de verdade. Você só **cola os comandos** e pronto.

## QUANDO rodar

Pensa numa rotina de **3 momentos** no dia de jogos:

| Momento | Rode o comando | Por quê (em miúdos) |
|---|---|---|
| 🌅 **Quando lembrar / de manhã** | **1** | anota os jogos que vêm e guarda o preço de hoje |
| ⏰ **Umas horas antes dos jogos** (se der) | **2** | pega o preço **final** (o mais esperto) — é o que prova se a gente "comprou barato" |
| 🌙 **À noite, depois dos jogos** | **3** e depois **4** | marca quem ganhou e mostra o boletim |

> **Regra de bolso:** se você só conseguir sentar 1 vez no dia, rode **1 → 3 → 4** na ordem.
> O comando **2** é o único que pede pontaria de horário (perto dos jogos). Sem ele, o resto
> funciona igual — só falta uma das provas (a do "comprei barato").
>
> Não tem problema rodar de novo o mesmo comando: ele não duplica nada, só atualiza.

## COMO rodar

1. Abra o **terminal** na pasta do projeto (`odd-analyzer`).
2. **Cole** o comando e aperte Enter. (Dá pra colar um de cada vez.)

```bash
# 1) ANOTA os jogos que vêm + guarda o preço de hoje
npx tsx src/cli/forwardLog.ts

# 2) (perto dos jogos) pega o preço FINAL
npx tsx src/cli/snapshotClosing.ts

# 3) (depois dos jogos) marca quem GANHOU
npx tsx src/cli/settle.ts

# 4) mostra o BOLETIM
npx tsx src/cli/report.ts
```

Pronto. Não precisa decorar — é só voltar aqui e copiar.

## O que olhar no boletim (comando 4)

O comando 4 mostra uma tabelinha, uma linha por tipo de aposta (gols, vitória...). A coluna que
**você** precisa olhar é a primeira de número: **`n`** = quantos jogos já entraram.

- Enquanto **`n` for menor que ~30**, é cedo: os números balançam muito (sorte/azar). **Ignore.**
- Quando algum tipo passar de **`n` ≈ 30**, **me chame**: aí eu leio o resto das colunas pra você
  e digo se aquela aposta está pronta pra "ganhar estrela" (virar recomendação de verdade).

> O resto das colunas (Brier, ECE, CLV) são as "notas da prova". Você **não precisa** entendê-las —
> é o meu trabalho ler. Você só garante que o caderninho está enchendo (rodando os comandos).

## Quando me chamar

- Quando um tipo de aposta passar de **~30 jogos** no boletim → "lê o boletim pra mim".
- Se aparecer um **erro vermelho** ao rodar qualquer comando → me mande o texto.
- Quando quiser, é só dizer **"roda a Copa"** que eu disparo os 4 por você e te explico o resultado
  em português simples.

## O que estamos caçando agora

Além de provar gols e vitória, estamos testando uma fisgada: na Copa o mercado parece **pagar caro
demais no favorito**. O loop agora também anota o **empate e o azarão** de cada jogo — pra ver se
"apostar contra o favorito" dá lucro no papel. É só observar; daqui a umas semanas o boletim conta.
