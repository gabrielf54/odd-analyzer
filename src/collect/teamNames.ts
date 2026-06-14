// Normalizador de nome de SELEÇÃO entre fontes (crosswalk de jogo). O mesmo país sai com
// 3 grafias: BSD (EN/FR — "Germany", "Côte d'Ivoire"), KTO/Kambi (EN — "Ivory Coast") e
// Betnacional/Bet6 (PT — "Alemanha", "Costa do Marfim"). `canonicalTeam` reduz qualquer
// variante a UMA chave canônica (inglês, minúsculo, sem acento) para o Dice casar.
// FAIL-CLOSED: nome fora do mapa cai no próprio normalizado (acento-strip) — se não casar,
// o crosswalk devolve null e o operador passa o id da casa à mão. Escopo: Copa (seleções);
// ligas de clube (nomes menos traduzidos) entram depois se preciso.

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");

function strip(name: string): string {
  return (name ?? "").normalize("NFKD").replace(DIACRITICS, "")
    .toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// alias (já normalizado por strip) → canônico (também normalizado). Cobre PT, variantes EN
// e FR que DIFEREM. Quem é igual após strip (curacao, ecuador, senegal, panama...) dispensa.
const ALIAS: Record<string, string> = {
  // Europa
  alemanha: "germany",
  holanda: "netherlands", "paises baixos": "netherlands",
  espanha: "spain", inglaterra: "england", franca: "france", italia: "italy",
  belgica: "belgium", croacia: "croatia", suica: "switzerland", suecia: "sweden",
  dinamarca: "denmark", polonia: "poland", noruega: "norway", servia: "serbia",
  escocia: "scotland", "pais de gales": "wales", gales: "wales", irlanda: "ireland",
  turquia: "turkey", grecia: "greece", "republica tcheca": "czechia", tchequia: "czechia",
  "czech republic": "czechia", ucrania: "ukraine", romenia: "romania", hungria: "hungary",
  eslovaquia: "slovakia", eslovenia: "slovenia", albania: "albania", "bosnia e herzegovina": "bosnia",
  // Ásia / Oceania
  japao: "japan", "coreia do sul": "south korea", "korea republic": "south korea",
  ira: "iran", irao: "iran", "arabia saudita": "saudi arabia", catar: "qatar",
  australia: "australia", uzbequistao: "uzbekistan", "emirados arabes unidos": "united arab emirates",
  iraque: "iraq", jordania: "jordan", "nova zelandia": "new zealand",
  // Américas
  "estados unidos": "united states", eua: "united states", usa: "united states",
  mexico: "mexico", brasil: "brazil", uruguai: "uruguay", colombia: "colombia",
  equador: "ecuador", paraguai: "paraguay", "costa rica": "costa rica",
  // África
  marrocos: "morocco", egito: "egypt", gana: "ghana", camaroes: "cameroon",
  nigeria: "nigeria", argelia: "algeria", "costa do marfim": "ivory coast",
  "cote d ivoire": "ivory coast", "africa do sul": "south africa", tunisia: "tunisia",
  "cabo verde": "cape verde", "cape verde islands": "cape verde",
};

/** Reduz um nome de seleção (qualquer fonte/idioma) à chave canônica p/ comparação. */
export function canonicalTeam(name: string): string {
  const s = strip(name);
  return ALIAS[s] ?? s;
}
