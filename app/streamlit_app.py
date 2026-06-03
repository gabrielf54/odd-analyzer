"""Front (Streamlit) — 2 telas, 2 modos. UI fina: chama só odd_analyzer.service,
nunca o motor direto. Rodar: streamlit run app/streamlit_app.py

Modos: pós-jogo (jogos finalizados, mostra resultado real) e pré-jogo (jogos
futuros, registra paper-bet). Mercados de jogador confiáveis; partida selado."""
import streamlit as st

from odd_analyzer.config import get_required
from odd_analyzer.bsd.client import BSDClient
from odd_analyzer.store.repo import InMemoryRepo
from odd_analyzer import service
from odd_analyzer.model.markets import MARKETS

MERCADOS_JOGADOR = [("sot", "SOT"), ("finalizacoes", "Finalizações"), ("desarmes", "Desarmes")]
MERCADOS_PARTIDA = [("gols", "Gols"), ("escanteios", "Escanteios")]

# Status de calibração na Copa por mercado de jogador (atualizado pela re-validação de minutos):
# "ready" = passou o crivo (ECE<0.08 + BrierSkill>0) com minutos estimados → dinheiro liberado;
# "paper" = ainda não passou → paper/observação.
COPA_STATUS = {"sot": "paper", "finalizacoes": "paper", "desarmes": "paper"}


@st.cache_resource
def _client():
    return BSDClient(get_required("BZZOIRO_API_KEY"))


@st.cache_resource
def _repo():
    try:
        from odd_analyzer.store.repo import SupabaseRepo
        return SupabaseRepo()
    except Exception:
        return InMemoryRepo()  # fallback offline


def tela_lista():
    st.title("odd-analyzer")
    modo = st.radio("Modo", ["Pós-jogo (validar)", "Pré-jogo (operar)"], horizontal=True)
    status = "finished" if modo.startswith("Pós") else "notstarted"
    st.session_state["modo"] = "pos" if status == "finished" else "pre"
    try:
        ligas = service.listar_ligas(_client())
    except Exception as e:
        st.warning(f"Não consegui listar as ligas ({type(e).__name__}); usando só o Brasileirão. "
                   f"Confira BZZOIRO_API_KEY no .env.")
        ligas = [{"id": 9, "nome": "Brasileirão Serie A", "pais": "Brazil"}]  # fallback offline
    ids = [lg["id"] for lg in ligas]
    rotulos = [f'{lg["nome"]} ({lg["pais"]})' if lg.get("pais") else lg["nome"] for lg in ligas]
    default_idx = ids.index(9) if 9 in ids else 0
    escolha = st.selectbox("Liga", range(len(ligas)), index=default_idx,
                           format_func=lambda i: rotulos[i])
    league = ids[escolha]
    busca = st.text_input("Buscar time").strip().lower()

    try:
        jogos = service.listar_jogos(_client(), int(league), status)
    except Exception as e:
        st.error(f"Fonte indisponível: {type(e).__name__} — {e}. Tente de novo. "
                 f"Se persistir, confira BZZOIRO_API_KEY no .env.")
        return
    if busca:
        jogos = [j for j in jogos if busca in (str(j["mandante"]) + str(j["visitante"])).lower()]
    if not jogos:
        st.info("Nenhum jogo nesse filtro.")
        return
    for j in jogos:
        placar = f" {j['placar']} " if j["placar"] else " × "
        col1, col2 = st.columns([4, 1])
        col1.write(f"**{j['mandante']}**{placar}**{j['visitante']}** · {(j['data'] or '')[:10]} · {j['status']}")
        if col2.button("Analisar →", key=f"go-{j['id']}"):
            st.session_state["evento"] = j
            st.rerun()


def tela_analise():
    j = st.session_state["evento"]
    modo = st.session_state.get("modo", "pos")
    if st.button("← voltar"):
        del st.session_state["evento"]
        st.rerun()
    placar = f" {j['placar']} " if j["placar"] else " × "
    st.subheader(f"{j['mandante']}{placar}{j['visitante']}")

    aba_labels = [lbl for _, lbl in MERCADOS_JOGADOR] + [f"{lbl} 🏷" for _, lbl in MERCADOS_PARTIDA]
    todos = MERCADOS_JOGADOR + MERCADOS_PARTIDA
    abas = st.tabs(aba_labels)
    for aba, (mkey, _) in zip(abas, todos):
        with aba:
            _render_mercado(j, mkey, modo)


def _render_mercado(j, market_key, modo):
    spec = MARKETS.get(market_key)
    em_validacao = (spec.nivel == "partida") if spec else (market_key in dict(MERCADOS_PARTIDA))
    if em_validacao:
        st.warning("EM VALIDAÇÃO — este mercado ainda não calibra; não apostar.")
    nome_metrica = spec.label if spec else market_key
    with st.expander("❓ Como ler isto"):
        st.markdown(
            f"- **Linha** = o nº de corte da métrica (*{nome_metrica}*). Ex.: **1,5** → a aposta é o jogador fazer **2 ou mais**.\n"
            "- **Odd Over** = quanto a casa paga se o jogador fizer **MAIS** que a linha (ex.: 2+). É a cotação (1,90 = aposto R$1, recebo R$1,90).\n"
            "- **Odd Under** = quanto a casa paga se ele ficar **ABAIXO** da linha (ex.: 0 ou 1).\n"
            "- Copie as odds **reais da sua casa de apostas** (Bet365/Betano…). Sem odd real, não dá pra medir valor.\n\n"
            "Na tabela: **p_mod** = chance pelo nosso modelo · **p_devig** = chance da casa já SEM a margem · "
            "**Edge** = sua vantagem (modelo − casa) · **EV** = retorno esperado por R$1 apostado."
        )
    ESCOPOS = {"Só seleção": "selecao", "Seleção + clube (todos)": "todos", "Só clube": "clube"}
    escopo_label = st.selectbox(
        "Forma recente (que jogos contar)", list(ESCOPOS), index=0, key=f"esc-{market_key}",
        help="Quais jogos do jogador entram na média: só os pela seleção (mesma camisa deste jogo, "
             "default — modo que calibra melhor em jogo de seleção), todos, ou só os do clube.")
    escopo_historico = ESCOPOS[escopo_label]
    _status = COPA_STATUS.get(market_key, "paper")
    if _status == "ready":
        st.caption("✅ Calibração de seleção validada com minutos esperados (ECE<0.08, BrierSkill>0). "
                   "Mercado liberado para dinheiro na Copa.")
    else:
        st.caption("⚠️ Calibração de seleção: este mercado segue em **paper/observação** na Copa "
                   "(não dinheiro real) até passar o crivo com minutos estimados. Ver ROADMAP.")
    c1, c2, c3, c4 = st.columns(4)
    linha = c1.number_input(
        "Linha", value=1.5, step=0.5, key=f"l-{market_key}",
        help=f"Nº de corte de {nome_metrica}. 1,5 = 'faz 2 ou mais'.")
    over = c2.number_input(
        "Odd Over", value=None, step=0.01, key=f"o-{market_key}", placeholder="ex. 1.70",
        help="Cotação REAL da casa p/ o jogador fazer MAIS que a linha. Copie da sua casa de apostas.")
    under = c3.number_input(
        "Odd Under", value=None, step=0.01, key=f"u-{market_key}", placeholder="ex. 2.10",
        help="Cotação REAL da casa p/ o jogador ficar ABAIXO da linha.")
    usar_ia = c4.checkbox("IA", key=f"ia-{market_key}",
                          help="Liga a explicação em linguagem natural (a IA explica, nunca inventa o número).")
    if not st.button("Varrer elenco", key=f"scan-{market_key}"):
        return
    if over is None or under is None:
        st.info("Coloque as **odds reais** da casa (Over e Under) pra calcular o valor. "
                "Sem a odd real dá só pra ver a chance do modelo — não se a aposta vale a pena.")
        return
    if over == under:
        st.warning(f"Over e Under iguais ({over:g}) costuma ser placeholder: a 'casa justa' vira "
                   "**50%** e o Edge deixa de medir valor real. Confira as odds reais (quase nunca são iguais).")
    try:
        out = service.analisar(_client(), j["id"], market_key, linha, over, under,
                               usar_ia=usar_ia, repo=_repo(),
                               escopo_historico=escopo_historico, league_id=j.get("league_id"))
    except Exception as e:
        st.error(f"Falha na análise: {type(e).__name__} — {e}")
        st.exception(e)  # traceback completo na própria página
        return
    cands = out["candidatos"]
    if not cands:
        st.info("Nenhum candidato com valor (edge/EV abaixo do corte). Poucas oportunidades fortes > muitas fracas.")
        return

    reais = {}
    if modo == "pos" and not em_validacao:
        try:
            reais = service.resultado_real_jogador(_client(), j["id"], market_key, linha)
        except Exception:
            reais = {}

    linhas_tab = []
    for c in cands:
        row = {
            "Jogador": c["jogador"], "Linha": c["linha"], "p_mod": round(c["prob_modelo"], 3),
            "p_devig": round(c["prob_devig"], 3), "Edge": round(c["edge"], 3), "EV": round(c["ev"], 3),
            "n": c["amostra_jogos"], "adv_concede": c.get("concedido_adversario", "n/d"),
        }
        if modo == "pos":
            r = reais.get(str(c.get("player_id")))
            row["Resultado"] = (f"{r['valor_real']} {'✅' if r['bateu'] else '❌'}") if r else "n/d"
        linhas_tab.append(row)
    st.table(linhas_tab)

    if modo == "pre":
        for c in cands:
            if st.button(f"Apostar (paper): {c['jogador']} {c['linha']}", key=f"bet-{market_key}-{c.get('player_id')}-{c['linha']}",
                         disabled=em_validacao):
                try:
                    service.apostar_paper(_repo(), j["id"], c, em_validacao=em_validacao)
                    st.success("Registrado no paper_ledger.")
                except Exception as e:
                    st.error(f"Não registrado: {e}")

    ia = out.get("ia") or {}
    ap = ia.get("melhor_aposta")
    if ap:
        st.success(f"🤖 {ap['jogador']} {ap['linha']} — {ap['veredito']} ({ap['confianca']}) · {ap['motivo']}")
    for alerta in ia.get("alertas", []):
        st.caption(f"[IA] {alerta}")


def render():
    if "evento" in st.session_state:
        tela_analise()
    else:
        tela_lista()


if __name__ == "__main__" or (hasattr(st, "runtime") and st.runtime.exists()):
    render()
