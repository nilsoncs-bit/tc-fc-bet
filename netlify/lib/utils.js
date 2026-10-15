import { createWallet, grantWeeklyStipend } from "../functions/engine.js";

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const weekNum = (w) => {
  const [y, n] = w.split("-W");
  return Number(y) * 100 + Number(n);
};

export function currentWeek() {
  const d = new Date();
  const jan1 = Date.UTC(d.getUTCFullYear(), 0, 1);
  const n = Math.ceil(((d - jan1) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${n}`;
}

export function nextWeekId(w) {
  const [y, n] = w.split("-W").map(Number);
  return n >= 52 ? `${y + 1}-W1` : `${y}-W${n + 1}`;
}

export const slug = (s) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

export function ensureWallets(state, players, week) {
  for (const p of players) {
    if (!state.wallets[p.id]) state.wallets[p.id] = { ...createWallet(p.id), lastStipendWeek: week };
    state.wallets[p.id] = grantWeeklyStipend(state.wallets[p.id], week);
  }
}
