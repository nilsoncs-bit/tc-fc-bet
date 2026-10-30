import { matchOdds, normalCdf, oddFromProbability, DEFAULT_SIGMA } from "../functions/engine.js";

// Under de pontos por equipe sempre com odd fixa
export const UNDER_ODD = 2.1;

// Linha da equipe: projeção arredondada para baixo + 0,5 (ex.: 115,6 -> 115,5; 121 -> 121,5)
const lineOf = (proj) => Math.floor(proj) + 0.5;

// Progresso por time: pct = fração da projeção já jogada, pts = pontos atuais.
// Média restante = pontos atuais + (1 - pct) x projeção. Incerteza diminui conforme o time avança.
export function fixtureOdds(state, f, projA, projB) {
  const live = state.live?.teams?.[f.id] ?? {};
  const remA = live.a ? 1 - live.a.pct : 1;
  const remB = live.b ? 1 - live.b.pct : 1;
  const mA = live.a ? live.a.pts + remA * projA : projA;
  const mB = live.b ? live.b.pts + remB * projB : projB;
  const sigA = DEFAULT_SIGMA * Math.sqrt(Math.max(0.05, remA));
  const sigB = DEFAULT_SIGMA * Math.sqrt(Math.max(0.05, remB));
  const ml = matchOdds(mA, mB, { sigma: (sigA + sigB) / 2 });

  const teamMarket = (proj, mean, sigma) => {
    const line = lineOf(proj);
    const pOver = 1 - normalCdf((line - mean) / sigma);
    return { line, oddO: oddFromProbability(pOver), oddU: UNDER_ODD };
  };

  return {
    oddA: ml.oddA,
    oddB: ml.oddB,
    tot: { a: teamMarket(projA, mA, sigA), b: teamMarket(projB, mB, sigB) },
  };
}
