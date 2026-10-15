import { simulateMatch, DEFAULT_SIGMA } from "../functions/engine.js";
import { SEED, PLAYOFF_SPOTS, TOTAL_SEASON_WEEKS } from "../functions/data.js";

function standingsRows(state) {
  const rows = Object.fromEntries(
    state.schedule.players.map((p) => {
      const s = SEED[p.id] ?? { w: 0, l: 0, pf: 0, pa: 0 };
      return [p.id, { id: p.id, name: p.name, team: p.team, w: s.w, l: s.l, pf: s.pf, pa: s.pa }];
    })
  );
  for (const weekRes of Object.values(state.results)) {
    for (const r of Object.values(weekRes)) {
      const A = rows[r.aId];
      const B = rows[r.bId];
      if (!A || !B) continue;
      A.pf += r.a;
      A.pa += r.b;
      B.pf += r.b;
      B.pa += r.a;
      if (r.winner === "A") { A.w++; B.l++; } else { B.w++; A.l++; }
    }
  }
  return Object.values(rows);
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Estimativa de % de playoffs: simula os jogos restantes com adversários aleatórios
function playoffChances(rows, sims = 2000) {
  const counts = Object.fromEntries(rows.map((r) => [r.id, 0]));
  for (let s = 0; s < sims; s++) {
    const sim = rows.map((r) => {
      const g = r.w + r.l;
      return { id: r.id, w: r.w, l: r.l, pf: r.pf, mean: g ? r.pf / g : 100, rem: Math.max(0, TOTAL_SEASON_WEEKS - g) };
    });
    const maxRem = Math.max(0, ...sim.map((x) => x.rem));
    for (let wk = 0; wk < maxRem; wk++) {
      const pool = shuffle(sim.filter((x) => x.rem > wk));
      for (let i = 0; i + 1 < pool.length; i += 2) {
        const A = pool[i];
        const B = pool[i + 1];
        const res = simulateMatch(A.mean, B.mean, { sigma: DEFAULT_SIGMA });
        A.pf += res.scoreA;
        B.pf += res.scoreB;
        if (res.winner === "A") { A.w++; B.l++; } else { B.w++; A.l++; }
      }
    }
    sim
      .sort((x, y) => y.w - x.w || y.pf - x.pf)
      .slice(0, PLAYOFF_SPOTS)
      .forEach((x) => counts[x.id]++);
  }
  return Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, Math.round((v / sims) * 100)]));
}

export function standingsView(state) {
  const rows = standingsRows(state).sort((x, y) => y.w - x.w || y.pf - x.pf);
  const chances = playoffChances(rows);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    team: r.team,
    w: r.w,
    l: r.l,
    pct: r.w + r.l ? (r.w / (r.w + r.l)).toFixed(3).replace(/^0/, "") : ".000",
    pf: +r.pf.toFixed(1),
    pa: +r.pa.toFixed(1),
    playoff: chances[r.id],
  }));
}
