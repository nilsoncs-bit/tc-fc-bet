// Odds pela barrinha de probabilidade. Não usa projeção.
export const MARGEM = 0.05;
export const ODD_MIN = 1.05;
export const ODD_MAX = 20;
export const P_MIN = 5;
export const P_MAX = 95;

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

export function oddDaProbabilidade(p) {
  return limita(1 / (p * (1 + MARGEM)));
}

// Linha de handicap do time A, arredondada para .5 (nunca cai exatamente no número inteiro)
export function linhaHandicap(p) {
  const margemEsperada = SIGMA_DIF * invNormal(p);
  return Math.round(-margemEsperada - 0.5) + 0.5;
}

export function oddsDaBarra(pInt) {
  const p = pInt / 100;
  return {
    p: pInt,
    oddA: oddDaProbabilidade(p),
    oddB: oddDaProbabilidade(1 - p),
    handicap: {
      linha: linhaHandicap(p),
      oddA: oddDaProbabilidade(0.5),
      oddB: oddDaProbabilidade(0.5),
    },
  };
}
