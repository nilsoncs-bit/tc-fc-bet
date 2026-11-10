import { winProbability, mulberry32 } from "../functions/engine.js";

// Vitória e handicap: chance pela projeção (ou barra manual do admin, que tem prioridade)
export const MARGEM = 0.05;
export const ODD_MIN = 1.05;
export const ODD_MAX = 20;
export const P_MIN = 35;
export const P_MAX = 65;
// Acima desse valor, o handicap automático do jogo fica desligado
export const HANDICAP_TETO = 15;

// Total por time: linha = projeção arredondada para baixo + 0,5. Odd fixa 55% over / 45% under
export const MARGEM_TOTAL = 0.05;
export const P_OVER = 0.55;

// Melhor / pior da rodada
export const MARGEM_RODADA = 0.125;
export const ODD_MAX_RODADA = 301;
const SIGMA_RODADA = 25;
const SIMS_RODADA = 50000;

// Dispersão da diferença de pontos entre dois times (usada só para converter % em linha de handicap)
const SIGMA_DIF = 38 * Math.SQRT2;

const limita = (x) => Math.min(ODD_MAX, Math.max(ODD_MIN, +x.toFixed(2)));

// Inversa da normal padrão (aproximação de Abramowitz e Stegun)
function invNormal(p) {
  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
    (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return p < 0.5 ? -z : z;
}

export function oddDaProbabilidade(p, margem = MARGEM) {
  return limita(1 / (p * (1 + margem)));
}

// Chance do time A (em %, inteiro) pela projeção, dentro dos limites da barra
export function pDaProjecao(projA, projB) {
  const p = Math.round(winProbability(projA, projB) * 100);
  return Math.min(P_MAX, Math.max(P_MIN, p));
}

// Linha de handicap do time A, arredondada para .5 (nunca cai exatamente no número inteiro)
export function linhaHandicap(p) {
  const margemEsperada = SIGMA_DIF * invNormal(p);
  return Math.round(-margemEsperada - 0.5) + 0.5;
}

// linhaManual: linha do time A definida pelo admin (ignora o teto de 15 pontos)
export function oddsDaBarra(pInt, linhaManual = null) {
  const p = pInt / 100;
  const auto = linhaHandicap(p);
  const linha = linhaManual ?? (Math.abs(auto) > HANDICAP_TETO ? null : auto);
  return {
    p: pInt,
    oddA: oddDaProbabilidade(p),
    oddB: oddDaProbabilidade(1 - p),
    handicapAuto: Math.abs(auto) > HANDICAP_TETO ? null : auto,
    handicap: linha === null ? null : {
      linha,
      oddA: oddDaProbabilidade(0.5),
      oddB: oddDaProbabilidade(0.5),
    },
  };
}

export const linhaTotal = (proj) => Math.floor(proj) + 0.5;

export function oddsTotal(linha) {
  return {
    linha,
    over: oddDaProbabilidade(P_OVER, MARGEM_TOTAL),
    under: oddDaProbabilidade(1 - P_OVER, MARGEM_TOTAL),
  };
}

export function oddRodada(p) {
  if (!(p > 0)) return ODD_MAX_RODADA;
  return Math.min(ODD_MAX_RODADA, Math.max(ODD_MIN, +(1 / (p * (1 + MARGEM_RODADA))).toFixed(2)));
}

// Chance de cada time ser o maior e o menor da rodada (simulação com semente fixa, sempre o mesmo resultado)
const cacheRodada = new Map();
export function chancesRodada(players) {
  const chave = players.map((p) => `${p.id}:${p.projection}`).join("|");
  if (cacheRodada.has(chave)) return cacheRodada.get(chave);
  const n = players.length;
  const proj = players.map((p) => p.projection);
  const media = proj.reduce((s, x) => s + x, 0) / n;
  const sd = proj.map((m) => SIGMA_RODADA * Math.sqrt(Math.max(m, 1) / media));
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
