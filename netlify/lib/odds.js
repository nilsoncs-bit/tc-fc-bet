import { matchOdds, normalCdf, oddFromProbability, DEFAULT_SIGMA } from "../functions/engine.js";

// Under sempre com odd fixa; over é calculada pela projeção
export const UNDER_ODD = 2.1;

// Odds do confronto. Com pontos ao vivo, a média vira "pontos atuais + parte que falta da projeção"
// e a incerteza diminui. Sem pontos, usa só a projeção da semana.
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
  const line = Math.floor(projA + projB) + 0.5;
  const sd = sigma * Math.SQRT2;
  const pOver = 1 - normalCdf((line - (mA + mB)) / sd);
  return {
    oddA: ml.oddA,
    oddB: ml.oddB,
    line,
    oddO: oddFromProbability(pOver),
    oddU: UNDER_ODD,
  };
}
