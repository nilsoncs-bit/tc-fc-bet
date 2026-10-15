import { getStore } from "@netlify/blobs";
import { matchOdds, placeBet, settleBet } from "./engine.js";
import { PLAYERS, FIXTURES } from "./data.js";
import { json, weekNum, currentWeek, nextWeekId, ensureWallets } from "../lib/utils.js";
import { parseSchedule } from "../lib/schedule.js";
import { authPlayer } from "../lib/auth.js";
import { standingsView } from "../lib/standings.js";

async function loadState(store) {
  const state = (await store.get("state", { type: "json" })) ?? {};
  state.week = currentWeek();
  state.wallets ??= {};
  state.auth ??= {};
  state.results ??= {};
  state.registry ??= {};
  state.results[state.week] ??= {};
  state.schedule ??= { week: state.week, players: PLAYERS, fixtures: FIXTURES };
  // Confrontos da próxima semana entram em vigor quando a semana vira
  if (state.pending && weekNum(state.pending.week) <= weekNum(state.week)) {
    state.schedule = state.pending;
    state.pending = null;
  }
  for (const p of PLAYERS) state.registry[p.id] ??= { id: p.id, name: p.name, team: p.team };
  for (const p of state.schedule.players) state.registry[p.id] = { id: p.id, name: p.name, team: p.team };
  ensureWallets(state, state.schedule.players, state.week);
  return state;
}

const playerOf = (state, id) => state.schedule.players.find((p) => p.id === id) ?? state.registry[id];
const oddsFor = (state, f) => matchOdds(playerOf(state, f.a).projection, playerOf(state, f.b).projection);

function view(state) {
  const cfg = state.schedule;
  return {
    week: state.week,
    scheduleWeek: cfg.week,
    pendingWeek: state.pending?.week ?? null,
    players: cfg.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
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
        oddA: o.oddA,
        oddB: o.oddB,
        result: state.results[state.week][f.id] ?? null,
      };
    }),
    standings: standingsView(state),
  };
}

export default async (req) => {
  const store = getStore("tcfc");
  const state = await loadState(store);
  const save = () => store.setJSON("state", state);

  if (req.method === "GET") {
    await save();
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
    for (const id of Object.keys(state.wallets)) {
      let w = state.wallets[id];
      for (let i = 0; i < w.history.length; i++) {
        const h = w.history[i];
        if (h.type !== "bet" || h.status !== "open" || h.week !== state.week) continue;
        const r = state.results[state.week][h.fixtureId];
        if (r) w = settleBet(w, i, h.side === r.winner);
      }
      state.wallets[id] = w;
    }
    await save();
    return json(view(state));
  }

  // Daqui em diante, toda ação de jogador exige nome + PIN válidos
  const auth = authPlayer(state, body.user, body.pin);
  if (auth.error) return json({ error: auth.error }, 401);

  if (body.action === "bet") {
    const f = state.schedule.fixtures.find((x) => x.id === body.fixtureId);
    if (!f) return json({ error: "Confronto não encontrado" }, 400);
    if (state.results[state.week][f.id]) return json({ error: "Confronto já encerrado" }, 400);
    if (body.side !== "A" && body.side !== "B") return json({ error: "Lado inválido" }, 400);
    const w = state.wallets[body.user];
    const repeated = w.history.some(
      (h) => h.type === "bet" && h.status === "open" && h.week === state.week && h.fixtureId === f.id
    );
    if (repeated) return json({ error: "Você já apostou neste confronto" }, 400);

    const o = oddsFor(state, f);
    const odd = body.side === "A" ? o.oddA : o.oddB;
    let nw;
    try {
      nw = placeBet(w, body.stake, odd);
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    const last = nw.history.length - 1;
    nw.history[last] = { ...nw.history[last], fixtureId: f.id, side: body.side, week: state.week };
    state.wallets[body.user] = nw;
    await save();
    return json(view(state));
  }

  return json({ error: "Ação inválida" }, 400);
};
