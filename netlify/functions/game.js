import { getStore } from "@netlify/blobs";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import {
  matchOdds, grantWeeklyStipend, createWallet, placeBet, settleBet, simulateMatch, DEFAULT_SIGMA,
} from "./engine.js";
import { PLAYERS, FIXTURES, SEED, PLAYOFF_SPOTS, TOTAL_SEASON_WEEKS } from "./data.js";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const weekNum = (w) => {
  const [y, n] = w.split("-W");
  return Number(y) * 100 + Number(n);
};

function currentWeek() {
  const d = new Date();
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const n = Math.ceil(((d - jan1) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${n}`;
}

function nextWeekId(w) {
  const [y, n] = w.split("-W").map(Number);
  return n >= 52 ? `${y + 1}-W1` : `${y}-W${n + 1}`;
}

const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

function ensureWallets(state, players, week) {
  for (const p of players) {
    if (!state.wallets[p.id]) state.wallets[p.id] = { ...createWallet(p.id), lastStipendWeek: week };
    state.wallets[p.id] = grantWeeklyStipend(state.wallets[p.id], week);
  }
}

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

// Lê o texto colado pelo admin: 2 linhas por confronto ("Nome | Time | Projeção"), blocos separados por linha em branco
function parseSchedule(text, week, registry) {
  const blocks = text
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  if (!blocks.length) throw new Error("Cole os confrontos antes de salvar");
  const players = [];function standingsRows(state) {
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

function standingsView(state) {
  const rows = standingsRows(state).sort((x, y) => y.w - x.w ||export default async (req) => {
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
    
