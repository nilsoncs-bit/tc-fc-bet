import { getStore } from "@netlify/blobs";
import { placeBet, settleBet } from "./engine.js";
import { PLAYERS, FIXTURES, EMOTES } from "./data.js";
import { json, weekNum, currentWeek, nextWeekId, ensureWallets } from "../lib/utils.js";
import { parseSchedule } from "../lib/schedule.js";
import { authPlayer } from "../lib/auth.js";
import { standingsView } from "../lib/standings.js";
import { fixtureOdds } from "../lib/odds.js";

async function loadState(store) {
  const state = (await store.get("state", { type: "json" })) ?? {};
  state.week = currentWeek();
  state.wallets ??= {};
  state.auth ??= {};
  state.results ??= {};
  state.registry ??= {};
  state.emotes ??= {};
  state.results[state.week] ??= {};
  if (!state.live || state.live.week !== state.week) {
    state.live = { week: state.week, progress: 0, points: {} };
  }
  state.schedule ??= { week: state.week, players: PLAYERS, fixtures: FIXTURES };
  if (state.pending && weekNum(state.pending.week) <= weekNum(state.week)) {
    state.schedule = state.pending;
    state.pending = null;
  }
  for (const p of PLAYERS) state.registry[p.id] ??= { id: p.id, name: p.name, team: p.team };
  for (const p of state.schedule.players) state.registry[p.id] = { id: p.id, name: p.name, team: p.team };
  ensureWallets(state, state.schedule.players, state.week);
  return state;
}

const emoteOf = (state, id) => state.emotes?.[id] ?? EMOTES[id] ?? "⚽";
const playerOf = (state, id) => state.schedule.players.find((p) => p.id === id) ?? state.registry[id];
const oddsFor = (state, f) =>
  fixtureOdds(state, f, playerOf(state, f.a).projection, playerOf(state, f.b).projection);

// Uma perna ganha ou perde conforme o mercado
const legWon = (leg, r) => {
  const market = leg.market ?? "ml";
  if (market === "tot") {
    const pts = leg.team === "a" ? r.a : r.b;
    return leg.side === "O" ? pts > leg.line : pts < leg.line;
  }
  if (market === "ou") {
    const total = r.a + r.b;
    return leg.side === "O" ? total > leg.line : total < leg.line;
  }
  return leg.side === r.winner;
};

function settleMulti(wallet, index, won) {
  const bet = wallet.history[index];
  const payout = won ? Math.floor(bet.stake * bet.odd) : 0;
  const history = wallet.history.map((h, i) =>
    i === index ? { ...h, status: won ? "won" : "lost", payout } : h
  );
  return { ...wallet, balance: wallet.balance + payout, history };
}

function buildLeg(state, item) {
  const f = state.schedule.fixtures.find((x) => x.id === item.fixtureId);
  if (!f) throw new Error("Confronto não encontrado");
  if (state.results[state.week][f.id]) throw new Error("Confronto já encerrado");
  const o = oddsFor(state, f);
  if (item.market === "tot") {
    if (item.team !== "a" && item.team !== "b") throw new Error("Equipe inválida");
    if (item.side !== "O" && item.side !== "U") throw new Error("Lado inválido");
    const t = o.tot[item.team];
    return {
      fixtureId: f.id,
      market: "tot",
      team: item.team,
      side: item.side,
      line: t.line,
      odd: item.side === "O" ? t.oddO : t.oddU,
    };
  }
  if (item.side !== "A" && item.side !== "B") throw new Error("Lado inválido");
  return { fixtureId: f.id, market: "ml", side: item.side, odd: item.side === "A" ? o.oddA : o.oddB };
}

function view(state) {
  const cfg = state.schedule;
  return {
    week: state.week,
    progress: state.live.progress,
    scheduleWeek: cfg.week,
    pendingWeek: state.pending?.week ?? null,
    players: cfg.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      emote: emoteOf(state, p.id),
      balance: state.wallets[p.id].balance,
      history: state.wallets[p.id].history,
    })),
    fixtures: cfg.fixtures.map((f) => {
      const A = playerOf(state, f.a);
      const B = playerOf(state, f.b);
      const o = oddsFor(state, f);
      return {
        id: f.id,
        a: A.team,
        b: B.team,
        aEmote: emoteOf(state, f.a),
        bEmote: emoteOf(state, f.b),
        oddA: o.oddA,
        oddB: o.oddB,
        tot: o.tot,
        result: state.results[state.week][f.id] ?? null,
        live: state.live.points[f.id] ?? null,
      };
    }),
    standings: standingsView(state).map((r) => ({ ...r, emote: emoteOf(state, r.id) })),
  };
}

export default async (req) => {
  const store = getStore("tcfc");
  const state = await loadState(store);
  const save = () => store.setJSON("state", state);

  if (req.method === "GET") {
    // Leitura não grava: evita sobrescrever apostas feitas em paralelo
    return json(view(state));
  }
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);

  const body = await req.json();
  const isAdmin = !!process.env.ADMIN_PASSWORD && body.password === process.env.ADMIN_PASSWORD;

  if (body.action === "login") {
    const r = authPlayer(state, body.user, body.pin, { create: true });
    if (r.error) return json({ error: r.error }, 401);
    await save();
    return json({ ...view(state), created: !!r.created });
  }

  if (body.action === "schedule") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const week = body.target === "current" ? state.week : nextWeekId(state.week);
    let parsed;
    try {
      parsed = parseSchedule(body.text ?? "", week, state.registry);
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    for (const p of parsed.players) state.registry[p.id] = { id: p.id, name: p.name, team: p.team };
    ensureWallets(state, parsed.players, state.week);
    if (body.target === "current") state.schedule = parsed;
    else state.pending = parsed;
    await save();
    return json(view(state));
  }

  if (body.action === "live") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const p = Number(body.progress);
    const points = {};
    for (const [fid, v] of Object.entries(body.points ?? {})) {
      if (typeof v?.a === "number" && typeof v?.b === "number") points[fid] = { a: v.a, b: v.b };
    }
    state.live = {
      week: state.week,
      progress: Number.isFinite(p) ? Math.min(1, Math.max(0, p / 100)) : 0,
      points,
    };
    await save();
    return json(view(state));
  }

  if (body.action === "results") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const scores = body.scores ?? {};
    for (const f of state.schedule.fixtures) {
      const s = scores[f.id];
      if (!s || typeof s.a !== "number" || typeof s.b !== "number") continue;
      // Empate fica com o lado A
      state.results[state.week][f.id] = {
        a: s.a,
        b: s.b,
        winner: s.a >= s.b ? "A" : "B",
        aId: f.a,
        bId: f.b,
      };
    }
    const res = state.results[state.week];
    for (const id of Object.keys(state.wallets)) {
      let w = state.wallets[id];
      for (let i = 0; i < w.history.length; i++) {
        const h = w.history[i];
        if (h.status !== "open" || h.week !== state.week) continue;
        if (h.type === "bet") {
          const r = res[h.fixtureId];
          if (r) w = settleBet(w, i, legWon(h, r));
        } else if (h.type === "multi") {
          const outcomes = h.legs.map((leg) => (res[leg.fixtureId] ? legWon(leg, res[leg.fixtureId]) : null));
          if (outcomes.includes(false)) w = settleMulti(w, i, false);
          else if (outcomes.every((o) => o === true)) w = settleMulti(w, i, true);
        }
      }
      state.wallets[id] = w;
    }
    await save();
    return json(view(state));
  }

  // Daqui em diante, toda ação de jogador exige nome + PIN válidos
  const auth = authPlayer(state, body.user, body.pin);
  if (auth.error) return json({ error: auth.error }, 401);

  if (body.action === "emote") {
    const text = String(body.emote ?? "").trim();
    const graphemes = [...new Intl.Segmenter().segment(text)];
    if (graphemes.length !== 1 || text.length > 16) {
      return json({ error: "Escolha exatamente 1 emoji" }, 400);
    }
    state.emotes[body.user] = text;
    await save();
    return json(view(state));
  }

  if (body.action === "bet") {
    try {
      const leg = buildLeg(state, body);
      const w = state.wallets[body.user];
      const dup = w.history.some(
        (h) =>
          h.type === "bet" &&
          h.status === "open" &&
          h.week === state.week &&
          h.fixtureId === leg.fixtureId &&
          (h.market ?? "ml") === leg.market &&
          (h.team ?? null) === (leg.team ?? null)
      );
      if (dup) return json({ error: "Você já apostou neste mercado" }, 400);
      const nw = placeBet(w, body.stake, leg.odd);
      const last = nw.history.length - 1;
      nw.history[last] = { ...nw.history[last], ...leg, week: state.week };
      state.wallets[body.user] = nw;
      await save();
      return json(view(state));
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  }

  if (body.action === "multi") {
    try {
      const items = Array.isArray(body.legs) ? body.legs : [];
      if (items.length < 2) throw new Error("A múltipla precisa de pelo menos 2 seleções");
      const ids = items.map((i) => i.fixtureId);
      if (new Set(ids).size !== ids.length) {
        throw new Error("Só é permitida uma seleção por confronto na múltipla");
      }
      const legs = items.map((i) => buildLeg(state, i));
      const odd = +legs.reduce((acc, l) => acc * l.odd, 1).toFixed(2);
      const w = state.wallets[body.user];
      const nw = placeBet(w, body.stake, odd);
      const last = nw.history.length - 1;
      nw.history[last] = { ...nw.history[last], type: "multi", legs, week: state.week };
      state.wallets[body.user] = nw;
      await save();
      return json(view(state));
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  }

  return json({ error: "Ação inválida" }, 400);
};
