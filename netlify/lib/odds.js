import { matchOdds, normalCdf, oddFromProbability, DEFAULT_SIGMA } from "../functions/engine.js";

// Under de pontos por equipe sempre com odd fixa
export const UNDER_ODD = 2.1;

// Linha da equipe: projeção arredondada para baixo + 0,5 (ex.: 115,6 -> 115,5; 121 -> 121,5)
const lineOf = (proj) => Math.floor(proj) + 0.5;

// Com pontos ao vivo, a média vira "pontos atuais + parte que falta da projeção" e a incerteza diminui.
// Sem pontos, usa só a projeção da semana.
export function fixtureOdds(state, f, projA, projB) {
  const progress = Math.min(1, Math.max(0, state.live?.progress ?? 0));
  const remain = 1 - progress;
  const pts = state.live?.points?.[f.id];
  let mA = projA;
  let mB = projB;
  let sigma = DEFAULT_SIGMA;
  if (pts) {
    mA = pts.a + remain * projA;
    mB = pts.b + remain * projB;
    sigma = DEFAULT_SIGMA * Math.sqrt(Math.max(0.05, remain));
  }
  const ml = matchOdds(mA, mB, { sigma });

  const teamMarket = (proj, mean) => {
    const line = lineOf(proj);
    const pOver = 1 - normalCdf((line - mean) / sigma);
    return { line, oddO: oddFromProbability(pOver), oddU: UNDER_ODD };
  };

  return {
    oddA: ml.oddA,
    oddB: ml.oddB,
    tot: { a: teamMarket(projA, mA), b: teamMarket(projB, mB) },
  };
}
