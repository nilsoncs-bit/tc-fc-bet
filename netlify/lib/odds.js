import { normalCdf, mulberry32 } from "../functions/engine.js";

// Configuração padrão das odds. O admin pode mudar tudo isso pela aba Admin (fica salvo em state.config).
// Desvios medidos em 5 semanas da liga (30 jogos): 29,5 por time e 42,5 na diferença do confronto.
export const CONFIG_PADRAO = {
  sigmaTime: 30, // desvio da pontuação de um time em relação à projeção
  sigmaDif: 42, // desvio da diferença de pontos de um confronto
  margemVitoria: 0.05,
  margemHandicap: 0.05,
  margemTotal: 0.05,
  pOver: 0.5, // chance do "mais de" no total por time
  margemRodada: 0.125, // melhor e Odireston da rodada
  tetoRodada: 301,
  margemFuturas: 0.1, // aba Futuras: campeão, playoff e lanterna
  tetoFuturas: 501,
};

// Limites de cada campo da configuração (o que vier fora disso é cortado)
export const CONFIG_LIMITES = {
  sigmaTime: [5, 80],
  sigmaDif: [5, 120],
  margemVitoria: [0, 0.5],
  margemHandicap: [0, 0.5],
  margemTotal: [0, 0.5],
  pOver: [0.05, 0.95],
  margemRodada: [0, 1],
  tetoRodada: [2, 1000],
  margemFuturas: [0, 1],
  tetoFuturas: [2, 5000],
};

export const ODD_MIN = 1.05;
export const ODD_MAX = 50;
// Faixa da chance de vitória (em %), tanto pela projeção quanto pela barra manual
export const P_MIN = 2;
export const P_MAX = 98;

export const configDe = (state) => ({ ...CONFIG_PADRAO, ...(state.config ?? {}) });

const limita = (x) => Math.min(ODD_MAX, Math.max(ODD_MIN, +x.toFixed(2)));

export function oddDaProbabilidade(p, margem) {
  return limita(1 / (Math.min(0.99, Math.max(0.01, p)) * (1 + margem)));
}

// Chance (em %, inteiro) de o time A vencer pela projeção
export function pDaProjecao(projA, projB, cfg) {
  const p = Math.round(normalCdf((projA - projB) / cfg.sigmaDif) * 100);
  return Math.min(P_MAX, Math.max(P_MIN, p));
}

export function oddsVitoria(pInt, cfg) {
  const p = pInt / 100;
  return { p: pInt, oddA: oddDaProbabilidade(p, cfg.margemVitoria), oddB: oddDaProbabilidade(1 - p, cfg.margemVitoria) };
}

// Linha de handicap do time A: a diferença das projeções, arredondada para .5 (sem limite de tamanho)
export function linhaHandicapAuto(projA, projB) {
  return Math.round(projB - projA - 0.5) + 0.5;
}

// Odds do handicap pela chance real de cobrir a linha (com a linha automática, fica perto de 50/50)
export function oddsHandicap(projA, projB, linha, cfg) {
  const pA = normalCdf((projA - projB + linha) / cfg.sigmaDif);
  return {
    linha,
    oddA: oddDaProbabilidade(pA, cfg.margemHandicap),
    oddB: oddDaProbabilidade(1 - pA, cfg.margemHandicap),
  };
}

// Total por time: linha = projeção arredondada para baixo + 0,5. Odd fixa pela chance configurada do "mais de"
export const linhaTotal = (proj) => Math.floor(proj) + 0.5;

export function oddsTotal(linha, cfg) {
  return {
    linha,
    over: oddDaProbabilidade(cfg.pOver, cfg.margemTotal),
    under: oddDaProbabilidade(1 - cfg.pOver, cfg.margemTotal),
  };
}

export function oddRodada(p, cfg) {
  if (!(p > 0)) return cfg.tetoRodada;
  return Math.min(cfg.tetoRodada, Math.max(ODD_MIN, +(1 / (p * (1 + cfg.margemRodada))).toFixed(2)));
}

// Chance de cada time ser o maior e o menor da rodada (simulação com semente fixa, sempre o mesmo resultado)
const SIMS_RODADA = 50000;
const cacheRodada = new Map();
export function chancesRodada(players, sigma) {
  const chave = sigma + "#" + players.map((p) => `${p.id}:${p.projection}`).join("|");
  if (cacheRodada.has(chave)) return cacheRodada.get(chave);
  const n = players.length;
  const proj = players.map((p) => p.projection);
  const media = proj.reduce((s, x) => s + x, 0) / n;
  const sd = proj.map((m) => sigma * Math.sqrt(Math.max(m, 1) / media));
  const melhor = new Array(n).fill(0);
  const pior = new Array(n).fill(0);
  const rng = mulberry32(20261110);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  for (let s = 0; s < SIMS_RODADA; s++) {
    let iMax = 0, iMin = 0, vMax = -Infinity, vMin = Infinity;
    for (let i = 0; i < n; i++) {
      const v = proj[i] + sd[i] * gauss();
      if (v > vMax) { vMax = v; iMax = i; }
      if (v < vMin) { vMin = v; iMin = i; }
    }
    melhor[iMax]++;
    pior[iMin]++;
  }
  const out = Object.fromEntries(
    players.map((p, i) => [p.id, { melhor: melhor[i] / SIMS_RODADA, pior: pior[i] / SIMS_RODADA }])
  );
  if (cacheRodada.size > 20) cacheRodada.clear();
  cacheRodada.set(chave, out);
  return out;
}
