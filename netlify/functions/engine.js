// fantasy-coins: motor de odds, simulação e carteira (Game Coins virtuais, sem valor real)

export const START_COINS = 1000;
export const WEEKLY_STIPEND = 100;
export const DEFAULT_SIGMA = 38;
export const DEFAULT_MARGIN = 0.08;

export function normalCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

export function winProbability(projA, projB, sigma = DEFAULT_SIGMA) {
  return normalCdf((projA - projB) / (sigma * Math.SQRT2));
}

export function oddFromProbability(p, margin = DEFAULT_MARGIN) {
  const q = Math.min(0.99, Math.max(0.01, p));
  return Math.max(1.05, +(1 / (q * (1 + margin))).toFixed(2));
}

export function matchOdds(projA, projB, { sigma = DEFAULT_SIGMA, margin = DEFAULT_MARGIN } = {}) {
  const pA = winProbability(projA, projB, sigma);
  return {
    pA,
    pB: 1 - pA,
    oddA: oddFromProbability(pA, margin),
    oddB: oddFromProbability(1 - pA, margin),
  };
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  const u = 1 - rng();
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function simulateMatch(projA, projB, { sigma = DEFAULT_SIGMA, rng = Math.random } = {}) {
  const scoreA = projA + sigma * gaussian(rng);
  const scoreB = projB + sigma * gaussian(rng);
  return {
    scoreA: +scoreA.toFixed(2),
    scoreB: +scoreB.toFixed(2),
    winner: scoreA >= scoreB ? "A" : "B",
  };
}

export function createWallet(userId) {
  return { userId, balance: START_COINS, lastStipendWeek: null, history: [] };
}

export function grantWeeklyStipend(wallet, weekId) {
  if (wallet.lastStipendWeek === weekId) return wallet;
  return {
    ...wallet,
    balance: wallet.balance + WEEKLY_STIPEND,
    lastStipendWeek: weekId,
    history: [...wallet.history, { type: "stipend", amount: WEEKLY_STIPEND, weekId }],
  };
}

export function placeBet(wallet, stake, odd) {
  if (!Number.isInteger(stake) || stake <= 0) throw new Error("Aposta deve ser inteira e positiva");
  if (stake > wallet.balance) throw new Error("Saldo insuficiente");
  return {
    ...wallet,
    balance: wallet.balance - stake,
    history: [...wallet.history, { type: "bet", stake, odd, status: "open" }],
  };
}

export function settleBet(wallet, index, won) {
  const bet = wallet.history[index];
  if (!bet || bet.type !== "bet" || bet.status !== "open") {
    throw new Error("Aposta inválida ou já liquidada");
  }
  const payout = won ? Math.floor(bet.stake * bet.odd) : 0;
  const history = wallet.history.map((h, i) =>
    i === index ? { ...h, status: won ? "won" : "lost", payout } : h
  );
  return { ...wallet, balance: wallet.balance + payout, history };
}
