import { createWallet } from "../functions/engine.js";

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

// Só cria a carteira de quem ainda não tem. O bônus semanal agora é dado no FECHAR SEMANA E AVANÇAR.
export function ensureWallets(state, players, week) {
  for (const p of players) {
    if (!state.wallets[p.id]) state.wallets[p.id] = { ...createWallet(p.id), lastStipendWeek: week };
  }
}

// Semana interna ("2026-W47") como número contínuo, para contar semanas mesmo na virada do ano
export const weekIdx = (w) => {
  const [y, n] = w.split("-W").map(Number);
  return y * 52 + n - 1;
};
export const weekFromIdx = (i) => `${Math.floor(i / 52)}-W${(i % 52) + 1}`;

// Semana da NFL: state.nfl = { base: semana interna de referência, semana: número da NFL nela, temporada }
export const nflDe = (state, w) => state.nfl.semana + weekIdx(w) - weekIdx(state.nfl.base);
export const rotuloSemana = (state, w) => `W${nflDe(state, w)} ${state.nfl.temporada}`;
// Converte "W7", "W7 2026" ou "2026-W43" na semana interna
export function semanaInterna(state, txt) {
  const t = String(txt ?? "").trim();
  if (/^\d{4}-W\d{1,2}$/.test(t)) return t;
  const m = t.match(/^W?\s*(\d{1,2})(?:\s+\d{4})?$/i);
  if (!m) return null;
  return weekFromIdx(weekIdx(state.nfl.base) + Number(m[1]) - state.nfl.semana);
}
