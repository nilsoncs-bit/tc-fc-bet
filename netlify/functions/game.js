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
  const players = [];
  const fixtures = [];
  blocks.forEach((block, i) => {
    if (block.length !== 2) throw new Error(`Confronto ${i + 1}: cada confronto precisa de 2 linhas`);
    const ids = block.map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error(`Linha inválida: "${line}"`);
      const projection = Number(parts[2].replace(",", "."));
      if (!Number.isFinite(projection)) throw new Error(`Projeção inválida: "${line}"`);
      const known = Object.values(registry).find((r) => r.name.toLowerCase() === parts[0].toLowerCase());
      const id = known?.id ?? slug(parts[0]);
      if (!players.some((p) => p.id === id)) players.push({ id, name: parts[0], team: parts[1], projection });
      return id;
    });
    fixtures.push({ id: `f${i + 1}`, a: ids[0], b: ids[1] });
  });
  return { week, players, fixtures };
}

const playerOf = (state, id) => state.schedule.players.find((p) => p.id === id) ?? state.registry[id];
const oddsFor = (state, f) => matchOdds(playerOf(state, f.a).projection, playerOf(state, f.b).projection);

// Login por nome + PIN. Com create=true, cria o PIN no primeiro acesso.
function authPlayer(state, user, pin, { create = false } = {}) {
  if (!state.registry[user]) return { error: "Jogador inválido" };
  if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) return { error: "O PIN deve ter de 4 a 6 números" };
  const rec = state.auth[user];
  if (!rec) {
    if (!create) return { error: "Faça o primeiro acesso para criar seu PIN" };
    const salt = randomBytes(16).toString("hex");
    state.auth[user] = { salt, hash: scryptSync(pin, salt, 32).toString("hex") };
    return { created: true };
  }
  const ok = timingSafeEqual(Buffer.from(rec.hash, "hex"), scryptSync(pin, rec.salt, 32));
  return ok ? {} : { error: "PIN incorreto" };
}

function standingsRows(state) {
  const rows = Object.fromEntries(
    state.schedule.players.map((p) => {
      const s = SEED[p.id] ?? { w: 0, l: 0, pf: 0, pa: 0 };
      return [p.id, { id: p.id, name: p.name, team: p.team, w: s.w, l: s.l, pf: s.pf, pa: s.pa }];
    })
  );
  for (const weekRes of Object.values(state.results)) {
    for (const r of Object.values(weekRes)) {
      const A = row
