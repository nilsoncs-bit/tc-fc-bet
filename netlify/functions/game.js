import { getStore } from "@netlify/blobs";
import { placeBet, settleBet, winProbability } from "./engine.js";
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
  state.duels ??= {};
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
  const teamA = playerOf(state, f.a).team;
  const teamB = playerOf(state, f.b).team;
  const match = `${teamA} x ${teamB}`;
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
      match,
      pick: `${item.team === "a" ? teamA : teamB}: ${item.side === "O" ? "mais" : "menos"} de ${t.line}`,
    };
  }
  if (item.side !== "A" && item.side !== "B") throw new Error("Lado inválido");
  return {
    fixtureId: f.id,
    market: "ml",
    side: item.side,
    odd: item.side === "A" ? o.oddA : o.oddB,
    match,
    pick: item.side === "A" ? teamA : teamB,
  };
}

function view(state) {
  const cfg = state.schedule;
  return {
    week: state.week,
    progress: state.live.progress,
    frozen: state.frozen === state.week,
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
    duels: Object.values(state.duels).map((d) => ({
      ...d,
      nomeA: nomeOf(state, d.desafiante), nomeB: nomeOf(state, d.desafiado),
      nomeM: d.mediador ? nomeOf(state, d.mediador) : null,
      emoteA: emoteOf(state, d.desafiante), emoteB: emoteOf(state, d.desafiado),
      teamA: teamOf(state, d.desafiante), teamB: teamOf(state, d.desafiado),
    })),
  };
}

function settleWeek(state, week) {
  const res = state.results[week] ?? {};
  for (const id of Object.keys(state.wallets)) {
    let w = state.wallets[id];
    for (let i = 0; i < w.history.length; i++) {
      const h = w.history[i];
      if (h.status !== "open" || h.week !== week) continue;
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
}

const nomeOf = (state, id) => state.registry[id]?.name ?? id;
const teamOf = (state, id) => state.registry[id]?.team ?? id;

const ptsOf = (state, week, pid) => {
  for (const r of Object.values(state.results[week] ?? {})) {
    if (r.aId === pid) return r.a;
    if (r.bId === pid) return r.b;
  }
  return null;
};

function mov(state, uid, delta, desc, week) {
  const w = state.wallets[uid];
  if (!w) return;
  w.balance += delta;
  w.history.push({ type: "duel", delta, desc, week });
}

function cancelDuel(state, d, status) {
  if (d.status !== "pendente") return;
  mov(state, d.desafiante, d.valor, "1x1 cancelado: valor devolvido", d.week);
  if (d.aceites.desafiado) mov(state, d.desafiado, d.valor, "1x1 recusado: valor devolvido", d.week);
  d.status = status;
}

function settleSpectators(state, d, ganhou) {
  const empate = ganhou === "E";
  for (const b of d.apostas.filter((x) => x.modo === "barra")) {
    if (empate) {
      mov(state, b.user, b.valor, "1x1 empatou: devolução", d.week);
      mov(state, d.mediador, b.med, "1x1 empatou: devolução da mediação", d.week);
    } else if (b.side === ganhou) {
      mov(state, b.user, b.pot, "Aposta com mediador vencida", d.week);
    } else {
      mov(state, d.mediador, b.pot, "Mediação: aposta de espectador perdida", d.week);
    }
  }
  const pool = d.apostas.filter((x) => x.modo === "pool");
  if (empate) {
    for (const b of pool) mov(state, b.user, b.valor, "1x1 empatou: devolução", d.week);
    return;
  }
  const Pw = pool.filter((x) => x.side === ganhou).reduce((s, x) => s + x.valor, 0);
  const Pl = pool.filter((x) => x.side !== ganhou).reduce((s, x) => s + x.valor, 0);
  const m = Math.min(Pw, Pl);
  for (const b of pool) {
    if (b.side === ganhou) {
      const extra = Pw ? Math.floor((b.valor * m) / Pw) : 0;
      mov(state, b.user, b.valor + extra, "Pool vencido", d.week);
    } else {
      const back = Pl ? Math.floor((b.valor * (Pl - m)) / Pl) : 0;
      mov(state, b.user, back, "Pool perdido: excedente devolvido", d.week);
    }
  }
}

function settleDuels(state) {
  for (const d of Object.values(state.duels)) {
    if (d.status !== "ativo") continue;
    const pa = ptsOf(state, d.week, d.desafiante);
    const pb = ptsOf(state, d.week, d.desafiado);
    if (pa === null || pb === null) continue;
    const v = d.valor;
    const ganhou = pa > pb ? "A" : pb > pa ? "B" : "E";
    if (ganhou === "E") {
      mov(state, d.desafiante, v, "1x1 empatou: devolução", d.week);
      mov(state, d.desafiado, v, "1x1 empatou: devolução", d.week);
    } else {
      const vencedor = ganhou === "A" ? d.desafiante : d.desafiado;
      if (d.modo === "odd2") {
        mov(state, vencedor, 2 * v, "1x1 vencido", d.week);
      } else {
        const odd = ganhou === "A" ? d.oddA : d.oddB;
        const g = Math.floor(v * odd);
        mov(state, vencedor, g, `1x1 vencido (odd ${odd})`, d.week);
        mov(state, d.mediador, 2 * v - g, "Mediação do 1x1", d.week);
      }
    }
    settleSpectators(state, d, ganhou);
    d.status = "encerrado";
    d.resultado = { a: pa, b: pb, vencedor: ganhou };
  }
}

export default async (req) => {
  const store = getStore("tcfc");
  const state = await loadState(store);
  const save = () => {
    settleDuels(state);
    return store.setJSON("state", state);
  };

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

  if (body.action === "freeze") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    state.frozen = state.frozen === state.week ? null : state.week;
    await save();
    return json(view(state));
  }

  if (body.action === "reopen") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const settled = Object.values(state.wallets).some((w) =>
      w.history.some((h) => h.week === state.week && (h.status === "won" || h.status === "lost"))
    );
    if (settled) return json({ error: "Há apostas já liquidadas nesta rodada. Não é possível reabrir." }, 400);
    state.results[state.week] = {};
    await save();
    return json(view(state));
  }

  if (body.action === "resetPin") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    if (!state.auth[body.target]) return json({ error: "Este jogador ainda não tem PIN" }, 400);
    delete state.auth[body.target];
    await save();
    return json(view(state));
  }

  if (body.action === "settlePrevious") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const week = String(body.week ?? "").trim();
    if (!/^\d{4}-W\d{1,2}$/.test(week)) return json({ error: "Semana inválida. Use o formato 2026-W43" }, 400);
    let parsed;
    try {
      parsed = parseSchedule(body.text ?? "", week, state.registry);
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    const scores = body.scores ?? {};
    state.results[week] ??= {};
    for (const f of parsed.fixtures) {
      const s = scores[f.id];
      if (!s || !Number.isFinite(s.a) || !Number.isFinite(s.b)) continue;
      state.results[week][f.id] = { a: s.a, b: s.b, winner: s.a >= s.b ? "A" : "B", aId: f.a, bId: f.b };
    }
    settleWeek(state, week);
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

  if (body.action === "duelCreate") {
    if (state.frozen === state.week) return json({ error: "Apostas congeladas nesta rodada" }, 400);
    const u = body.user;
    const dId = body.desafiado;
    const mId = body.mediador || null;
    const modo = body.modo === "barra" ? "barra" : "odd2";
    const v = Number(body.valor);
    const bal = state.wallets[u].balance;
    if (!state.schedule.players.some((p) => p.id === u)) return json({ error: "Você não está na rodada atual" }, 400);
    if (!state.schedule.players.some((p) => p.id === dId) || dId === u) return json({ error: "Escolha um adversário válido" }, 400);
    if (!Number.isInteger(v) || v <= 0) return json({ error: "Valor inválido" }, 400);
    if (bal < 0) return json({ error: "Saldo negativo: você não pode desafiar até zerar" }, 400);
    if (v > bal) return json({ error: "Saldo insuficiente" }, 400);
    let p = 50;
    let oddA = 2;
    let oddB = 2;
    if (modo === "barra") {
      if (!state.schedule.players.some((x) => x.id === mId) || mId === u || mId === dId) {
        return json({ error: "Escolha um mediador que não esteja no duelo" }, 400);
      }
      const A = playerOf(state, u);
      const B = playerOf(state, dId);
      const sugerida = Math.round(winProbability(A.projection, B.projection) * 100);
      const pb = Number(body.barra);
      p = Math.min(80, Math.max(20, Number.isFinite(pb) ? Math.round(pb) : sugerida));
      oddA = +(100 / p).toFixed(2);
      oddB = +(100 / (100 - p)).toFixed(2);
    }
    mov(state, u, -v, `1x1 criado contra ${nomeOf(state, dId)}`, state.week);
    const id = `d${Date.now().toString(36)}`;
    state.duels[id] = {
      id, week: state.week, desafiante: u, desafiado: dId,
      mediador: modo === "barra" ? mId : null,
      modo, valor: v, p, oddA, oddB,
      status: "pendente",
      aceites: { desafiado: false, mediador: modo === "odd2" },
      apostas: [],
      criado: Date.now(),
    };
    await save();
    return json(view(state));
  }

  if (body.action === "duelAccept") {
    if (state.frozen === state.week) return json({ error: "Apostas congeladas nesta rodada" }, 400);
    const d = state.duels[body.duelId];
    if (!d || d.status !== "pendente") return json({ error: "Desafio indisponível" }, 400);
    if (body.user === d.desafiado && !d.aceites.desafiado) {
      const bal = state.wallets[d.desafiado].balance;
      if (bal < 0) return json({ error: "Saldo negativo: você não pode aceitar até zerar" }, 400);
      if (bal < d.valor) return json({ error: "Saldo insuficiente para aceitar" }, 400);
      mov(state, d.desafiado, -d.valor, `1x1 aceito contra ${nomeOf(state, d.desafiante)}`, d.week);
      d.aceites.desafiado = true;
    } else if (d.mediador && body.user === d.mediador && !d.aceites.mediador) {
      d.aceites.mediador = true;
    } else {
      return json({ error: "Você não pode aceitar este desafio" }, 400);
    }
    if (d.aceites.desafiado && d.aceites.mediador) d.status = "ativo";
    await save();
    return json(view(state));
  }

  if (body.action === "duelRecusar") {
    const d = state.duels[body.duelId];
    if (!d || d.status !== "pendente") return json({ error: "Desafio indisponível" }, 400);
    if (body.user !== d.desafiado && body.user !== d.mediador) return json({ error: "Você não pode recusar este desafio" }, 400);
    cancelDuel(state, d, "recusado");
    await save();
    return json(view(state));
  }

  if (body.action === "duelCancelar") {
    const d = state.duels[body.duelId];
    if (!d || d.status !== "pendente" || body.user !== d.desafiante) return json({ error: "Desafio indisponível" }, 400);
    cancelDuel(state, d, "cancelado");
    await save();
    return json(view(state));
  }

  if (body.action === "duelApostar") {
    if (state.frozen === state.week) return json({ error: "Apostas congeladas nesta rodada" }, 400);
    const d = state.duels[body.duelId];
    if (!d || d.status !== "ativo") return json({ error: "Duelo não está ativo" }, 400);
    const u = body.user;
    if ([d.desafiante, d.desafiado, d.mediador].includes(u)) return json({ error: "Quem participa do duelo não pode apostar nele" }, 400);
    if (d.apostas.some((x) => x.user === u)) return json({ error: "Você já apostou neste duelo" }, 400);
    const bal = state.wallets[u].balance;
    if (bal < 0) return json({ error: "Saldo negativo: você não pode apostar até zerar" }, 400);
    const side = body.side === "B" ? "B" : "A";
    const modo = body.modo === "barra" ? "barra" : "pool";
    if (modo === "barra" && d.modo !== "barra") return json({ error: "Este duelo só aceita aposta em pool" }, 400);
    const v = Number(body.valor);
    if (!Number.isInteger(v) || v < 10 || v > d.valor) return json({ error: `Aposta de 10 a ${d.valor} GC` }, 400);
    if (v > bal) return json({ error: "Saldo insuficiente" }, 400);
    if (modo === "barra") {
      const odd = side === "A" ? d.oddA : d.oddB;
      const pot = Math.floor(v * odd);
      const med = pot - v;
      const exposicao = d.apostas.filter((x) => x.modo === "barra").reduce((s, x) => s + x.med, 0);
      if (exposicao + med > d.valor) return json({ error: "Limite do mediador atingido neste duelo" }, 400);
      mov(state, u, -v, "Aposta de espectador no 1x1", d.week);
      mov(state, d.mediador, -med, "Contraparte de aposta de espectador", d.week);
      d.apostas.push({ user: u, side, modo, valor: v, pot, med });
    } else {
      mov(state, u, -v, "Aposta em pool no 1x1", d.week);
      d.apostas.push({ user: u, side, modo, valor: v });
    }
    await save();
    return json(view(state));
  }

  if (body.action === "bet") {
    if (state.frozen === state.week) return json({ error: "Apostas congeladas nesta rodada" }, 400);
    if ((state.wallets[body.user]?.balance ?? 0) < 0) return json({ error: "Saldo negativo: você não pode apostar até zerar" }, 400);
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
    if (state.frozen === state.week) return json({ error: "Apostas congeladas nesta rodada" }, 400);
    if ((state.wallets[body.user]?.balance ?? 0) < 0) return json({ error: "Saldo negativo: você não pode apostar até zerar" }, 400);
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
