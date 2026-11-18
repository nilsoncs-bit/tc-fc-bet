import { getStore } from "@netlify/blobs";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { placeBet, settleBet, winProbability, WEEKLY_STIPEND } from "./engine.js";
import { PLAYERS, FIXTURES, EMOTES } from "./data.js";
import {
  json, weekNum, currentWeek, nextWeekId, ensureWallets, weekIdx, weekFromIdx, nflDe, rotuloSemana, semanaInterna,
} from "../lib/utils.js";
import { parseSchedule } from "../lib/schedule.js";
import { authPlayer } from "../lib/auth.js";
import { standingsView } from "../lib/standings.js";
import {
  CONFIG_PADRAO, CONFIG_LIMITES, configDe, pDaProjecao, oddsVitoria, linhaHandicapAuto, oddsHandicap,
  linhaTotal, oddsTotal, chancesRodada, oddRodada, P_MIN, P_MAX, ODD_MIN,
} from "../lib/odds.js";

async function loadState(store) {
  const state = (await store.get("state", { type: "json" })) ?? {};
  // A semana agora só muda no botão FECHAR SEMANA E AVANÇAR. Estado antigo: fica na semana em que estava salvo.
  state.week ??= currentWeek();
  // Rótulo da NFL: em 2026, a semana interna 46 é a W10 da NFL
  if (!state.nfl) {
    const n = Number(state.week.split("-W")[1]);
    state.nfl = { base: state.week, semana: Math.max(1, n - 36), temporada: 2026 };
  }
  state.wallets ??= {};
  state.auth ??= {};
  state.results ??= {};
  state.registry ??= {};
  state.emotes ??= {};
  state.duels ??= {};
  state.ajusteTabela ??= {};
  state.ajustes ??= [];
  state.fila ??= [];
  state.config ??= {};
  state.results[state.week] ??= {};
  // Odds manuais da rodada: zeradas na virada
  if (!state.odds || state.odds.week !== state.week) state.odds = { week: state.week, valores: {} };
  // Ajustes manuais, cada mercado separado: handicap (linha do time A), total (linha por time), melhor/Odireston (odd por time)
  state.odds.handicap ??= {};
  state.odds.total ??= {};
  state.odds.melhor ??= {};
  state.odds.pior ??= {};
  // Jogos congelados (vitória) e jogos com handicap/total fechados: zerados na virada
  if (!state.congelados || state.congelados.week !== state.week) state.congelados = { week: state.week, fids: [] };
  if (!state.extras || state.extras.week !== state.week) state.extras = { week: state.week, fids: [] };
  state.schedule ??= { week: state.week, players: PLAYERS, fixtures: FIXTURES };
  // Versão 12: o botão antigo fechava handicap, total e melhor/pior de todos os jogos de uma vez
  if (state.extrasFechados === state.week) {
    state.extras.fids = state.schedule.fixtures.map((f) => f.id);
    state.rodadaFechada = state.week;
  }
  delete state.extrasFechados;
  for (const p of PLAYERS) state.registry[p.id] ??= { id: p.id, name: p.name, team: p.team };
  for (const p of state.schedule.players) state.registry[p.id] = { id: p.id, name: p.name, team: p.team };
  ensureWallets(state, state.schedule.players, state.week);
  return state;
}

const emoteOf = (state, id) => state.emotes?.[id] ?? EMOTES[id] ?? "⚽";
const playerOf = (state, id) => state.schedule.players.find((p) => p.id === id) ?? state.registry[id];
const nomeOf = (state, id) => state.registry[id]?.name ?? id;
const teamOf = (state, id) => state.registry[id]?.team ?? id;
const projOf = (state, id) => playerOf(state, id)?.projection ?? 0;

// Vitória: barra manual do admin, se houver; senão, a chance pela projeção
const pAutoOf = (state, f) => pDaProjecao(projOf(state, f.a), projOf(state, f.b), configDe(state));
const pOf = (state, f) => {
  const manual = state.odds.valores[f.id];
  return Number.isFinite(manual) ? Math.min(P_MAX, Math.max(P_MIN, manual)) : pAutoOf(state, f);
};
const oddsFor = (state, f) => oddsVitoria(pOf(state, f), configDe(state));

// Handicap: linha manual do admin, se houver; senão, a diferença das projeções
function handicapOf(state, f) {
  const auto = linhaHandicapAuto(projOf(state, f.a), projOf(state, f.b));
  const manual = state.odds.handicap[f.id];
  const linha = Number.isFinite(manual) ? manual : auto;
  return { ...oddsHandicap(projOf(state, f.a), projOf(state, f.b), linha, configDe(state)), auto, manual: Number.isFinite(manual) };
}

// Total por time: linha manual do admin, se houver; senão, a projeção inicial
const totalOf = (state, pid) => {
  const manual = state.odds.total[pid];
  const auto = linhaTotal(projOf(state, pid));
  return { ...oddsTotal(Number.isFinite(manual) ? manual : auto, configDe(state)), auto, manual: Number.isFinite(manual) };
};

// Melhor e Odireston da rodada: odd manual do admin, se houver; senão, pela simulação das projeções
function rodadaOf(state) {
  const cfg = configDe(state);
  const ch = chancesRodada(state.schedule.players, cfg.sigmaTime);
  return state.schedule.players.map((p) => {
    const autoM = oddRodada(ch[p.id].melhor, cfg);
    const autoP = oddRodada(ch[p.id].pior, cfg);
    const mM = state.odds.melhor[p.id];
    const mP = state.odds.pior[p.id];
    return {
      id: p.id,
      pMelhor: ch[p.id].melhor,
      pPior: ch[p.id].pior,
      autoMelhor: autoM,
      autoPior: autoP,
      manualMelhor: Number.isFinite(mM),
      manualPior: Number.isFinite(mP),
      oddMelhor: Number.isFinite(mM) ? mM : autoM,
      oddPior: Number.isFinite(mP) ? mP : autoP,
    };
  });
}
const RODADA = ["mb", "mp"];
const NOME_RODADA = { mb: "Melhor da rodada", mp: "Odireston da rodada" };
// Melhor/Odireston fecham com CONGELAR TODOS ou com o botão próprio
const rodadaBloqueada = (state) => state.frozen === state.week || state.rodadaFechada === state.week;
// Vitória de um jogo: congelado sozinho ou por CONGELAR TODOS
const fixtureBloqueado = (state, fid) => state.frozen === state.week || state.congelados.fids.includes(fid);
// Handicap e total de um jogo: fecham junto com a vitória ou sozinhos
const extrasBloqueados = (state, fid) => fixtureBloqueado(state, fid) || state.extras.fids.includes(fid);

const legWon = (leg, r) => {
  const market = leg.market ?? "ml";
  if (market === "hc") {
    const diff = leg.side === "A" ? r.a + leg.line - r.b : r.b - leg.line - r.a;
    return diff > 0;
  }
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

// Quem é o alvo de cada perna (a favor e contra), usado nas estatísticas
function alvosDaPerna(leg) {
  if (leg.market === "mb") return { favor: leg.target };
  if (leg.market === "mp") return { contra: leg.target };
  if ((leg.market ?? "ml") === "tot") {
    const alvo = leg.team === "a" ? leg.ta : leg.tb;
    return leg.side === "O" ? { favor: alvo } : { contra: alvo };
  }
  return leg.side === "A" ? { favor: leg.ta, contra: leg.tb } : { favor: leg.tb, contra: leg.ta };
}

function settleMulti(wallet, index, won) {
  const bet = wallet.history[index];
  const payout = won ? Math.floor(bet.stake * bet.odd) : 0;
  const history = wallet.history.map((h, i) =>
    i === index ? { ...h, status: won ? "won" : "lost", payout } : h
  );
  return { ...wallet, balance: wallet.balance + payout, history };
}

function buildLeg(state, item) {
  if (RODADA.includes(item.market)) {
    if (rodadaBloqueada(state)) throw new Error(`${NOME_RODADA[item.market]} fechado pelo admin`);
    const alvo = state.schedule.players.find((p) => p.id === item.target);
    if (!alvo) throw new Error("Time inválido");
    const r = rodadaOf(state).find((x) => x.id === alvo.id);
    const melhor = item.market === "mb";
    return {
      market: item.market,
      target: alvo.id,
      side: item.market,
      odd: melhor ? r.oddMelhor : r.oddPior,
      nJogos: state.schedule.fixtures.length,
      match: NOME_RODADA[item.market],
      pick: `${alvo.team} ${melhor ? "maior" : "menor"} pontuação`,
    };
  }
  const f = state.schedule.fixtures.find((x) => x.id === item.fixtureId);
  if (!f) throw new Error("Confronto não encontrado");
  if (state.results[state.week][f.id]) throw new Error("Confronto já encerrado");
  if (fixtureBloqueado(state, f.id)) throw new Error("Este jogo está congelado");
  const o = oddsFor(state, f);
  const base = { fixtureId: f.id, ta: f.a, tb: f.b };
  const teamA = teamOf(state, f.a);
  const teamB = teamOf(state, f.b);
  const match = `${teamA} x ${teamB}`;
  if (item.market === "hc") {
    if (extrasBloqueados(state, f.id)) throw new Error("Handicap deste jogo fechado pelo admin");
    if (item.side !== "A" && item.side !== "B") throw new Error("Lado inválido");
    const h = handicapOf(state, f);
    const nome = item.side === "A" ? teamA : teamB;
    const linha = item.side === "A" ? h.linha : -h.linha;
    const txt = `${linha > 0 ? "+" : ""}${String(linha).replace(".", ",")}`;
    return {
      ...base,
      market: "hc",
      side: item.side,
      line: h.linha,
      odd: item.side === "A" ? h.oddA : h.oddB,
      match,
      pick: `${nome} ${txt}`,
    };
  }
  if (item.market === "tot") {
    if (extrasBloqueados(state, f.id)) throw new Error("Total deste jogo fechado pelo admin");
    if (item.team !== "a" && item.team !== "b") throw new Error("Time inválido");
    if (item.side !== "O" && item.side !== "U") throw new Error("Lado inválido");
    const t = totalOf(state, item.team === "a" ? f.a : f.b);
    const nome = item.team === "a" ? teamA : teamB;
    const linhaTxt = String(t.linha).replace(".", ",");
    return {
      ...base,
      market: "tot",
      team: item.team,
      side: item.side,
      line: t.linha,
      odd: item.side === "O" ? t.over : t.under,
      match,
      pick: `${nome} ${item.side === "O" ? "mais de" : "menos de"} ${linhaTxt}`,
    };
  }
  if (item.side !== "A" && item.side !== "B") throw new Error("Lado inválido");
  return {
    ...base,
    market: "ml",
    side: item.side,
    odd: item.side === "A" ? o.oddA : o.oddB,
    match,
    pick: item.side === "A" ? teamA : teamB,
  };
}

function settleWeek(state, week) {
  const res = state.results[week] ?? {};
  for (const id of Object.keys(state.wallets)) {
    let w = state.wallets[id];
    for (let i = 0; i < w.history.length; i++) {
      const h = w.history[i];
      if (h.status !== "open" || h.week !== week) continue;
      if (h.type === "bet" && RODADA.includes(h.market)) {
        const jogos = Object.values(res);
        if (jogos.length < (h.nJogos ?? 1)) continue;
        const pts = {};
        for (const r of jogos) { pts[r.aId] = r.a; pts[r.bId] = r.b; }
        if (!(h.target in pts)) continue;
        const vals = Object.values(pts);
        const alvo = h.market === "mb" ? Math.max(...vals) : Math.min(...vals);
        w = settleBet(w, i, pts[h.target] === alvo);
      } else if (h.type === "bet") {
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

// Desfaz os pagamentos de uma rodada, para lançar o resultado de novo
function revertWeek(state, week) {
  for (const w of Object.values(state.wallets)) {
    w.history = w.history.map((h) => {
      if (h.week !== week || (h.type !== "bet" && h.type !== "multi")) return h;
      if (h.status !== "won" && h.status !== "lost") return h;
      if (h.status === "won") w.balance -= h.payout ?? 0;
      const { payout, ...rest } = h;
      return { ...rest, status: "open" };
    });
  }
}

// ---------- 1x1 ----------
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

// ---------- estatísticas ----------
function statsView(state, escopo) {
  const row = {};
  for (const p of state.schedule.players) {
    row[p.id] = { id: p.id, name: p.name, team: p.team, emote: emoteOf(state, p.id), favor: 0, contra: 0, favorW: 0, favorL: 0, decepcao: 0 };
  }
  const matriz = {};
  for (const [uid, w] of Object.entries(state.wallets)) {
    for (const h of w.history) {
      if (h.type !== "bet" && h.type !== "multi") continue;
      if (escopo === "rodada" && h.week !== state.week) continue;
      if (h.status !== "open" && h.status !== "won" && h.status !== "lost") continue;
      const legs = h.type === "multi" ? h.legs : [h];
      for (const leg of legs) {
        if (!RODADA.includes(leg.market) && (!leg.ta || !leg.tb)) continue;
        const { favor, contra } = alvosDaPerna(leg);
        if (favor && row[favor]) {
          row[favor].favor += h.stake;
          if (h.type === "bet") {
            if (h.status === "won") row[favor].favorW++;
            if (h.status === "lost") { row[favor].favorL++; row[favor].decepcao += h.stake; }
          }
          matriz[uid] ??= {};
          matriz[uid][favor] = (matriz[uid][favor] ?? 0) + h.stake;
        }
        if (contra && row[contra]) row[contra].contra += h.stake;
      }
    }
  }
  return { jogadores: Object.values(row), matriz };
}

function view(state) {
  const cfg = state.schedule;
  return {
    week: state.week,
    semana: rotuloSemana(state, state.week),
    nfl: { base: state.nfl.base, semana: state.nfl.semana, temporada: state.nfl.temporada, atual: nflDe(state, state.week) },
    fila: state.fila.map((x) => ({ nfl: x.nfl, jogos: x.fixtures.length })),
    config: configDe(state),
    frozen: state.frozen === state.week,
    rodadaFechada: rodadaBloqueada(state),
    odds: state.odds.valores,
    congelados: state.congelados.fids,
    extras: state.extras.fids,
    players: cfg.players.map((p) => ({
      id: p.id,
      name: p.name,
      team: p.team,
      emote: emoteOf(state, p.id),
      projection: p.projection,
      balance: state.wallets[p.id].balance,
      history: state.wallets[p.id].history,
    })),
    fixtures: cfg.fixtures.map((f) => {
      const A = playerOf(state, f.a);
      const B = playerOf(state, f.b);
      const o = oddsFor(state, f);
      return {
        id: f.id,
        aId: f.a,
        bId: f.b,
        a: A.team,
        b: B.team,
        aEmote: emoteOf(state, f.a),
        bEmote: emoteOf(state, f.b),
        pA: o.p,
        pB: 100 - o.p,
        pAuto: pAutoOf(state, f),
        pManual: Number.isFinite(state.odds.valores[f.id]),
        oddA: o.oddA,
        oddB: o.oddB,
        handicap: handicapOf(state, f),
        totais: { a: totalOf(state, f.a), b: totalOf(state, f.b) },
        bloqueado: fixtureBloqueado(state, f.id),
        extrasBloqueados: extrasBloqueados(state, f.id),
        result: state.results[state.week][f.id] ?? null,
      };
    }),
    rodada: { bloqueada: rodadaBloqueada(state), times: rodadaOf(state) },
    standings: standingsView(state, configDe(state).sigmaTime).map((r) => ({ ...r, emote: emoteOf(state, r.id) })),
    duels: Object.values(state.duels).map((d) => ({
      ...d,
      nomeA: nomeOf(state, d.desafiante),
      nomeB: nomeOf(state, d.desafiado),
      nomeM: d.mediador ? nomeOf(state, d.mediador) : null,
      emoteA: emoteOf(state, d.desafiante),
      emoteB: emoteOf(state, d.desafiado),
      teamA: teamOf(state, d.desafiante),
      teamB: teamOf(state, d.desafiado),
    })),
    ajustes: state.ajustes.slice(-30).reverse(),
    auditoria: auditoriaView(state),
    ajusteTabela: state.ajusteTabela,
    estatisticas: { rodada: statsView(state, "rodada"), temporada: statsView(state, "temporada") },
  };
}

function auditoriaView(state) {
  const semanas = Object.keys(state.results)
    .sort()
    .filter((w) => Object.keys(state.results[w]).length)
    .map((week) => ({
      week,
      jogos: Object.values(state.results[week]).map((r) => ({
        a: teamOf(state, r.aId),
        b: teamOf(state, r.bId),
        pa: r.a,
        pb: r.b,
        vencedor: r.winner === "A" ? teamOf(state, r.aId) : teamOf(state, r.bId),
      })),
    }));
  const faltando = state.schedule.fixtures
    .filter((f) => !state.results[state.week][f.id])
    .map((f) => `${teamOf(state, f.a)} x ${teamOf(state, f.b)}`);
  const abertasAntigas = [];
  for (const [uid, w] of Object.entries(state.wallets)) {
    const porSemana = {};
    for (const h of w.history) {
      if ((h.type === "bet" || h.type === "multi") && h.status === "open" && h.week !== state.week) {
        porSemana[h.week] = (porSemana[h.week] ?? 0) + 1;
      }
    }
    for (const [week, n] of Object.entries(porSemana)) abertasAntigas.push({ nome: nomeOf(state, uid), week, n });
  }
  return { semanas, faltando, abertasAntigas };
}

const save = (store, state) => {
  settleDuels(state);
  return store.setJSON("state", state);
};

export default async (req) => {
  const store = getStore({ name: "tcfc", consistency: "strong" });
  const state = await loadState(store);

  if (req.method === "GET") {
    await save(store, state);
    return json(view(state));
  }
  if (req.method !== "POST") return json({ error: "Método não suportado" }, 405);

  const body = await req.json();
  const isAdmin = !!process.env.ADMIN_PASSWORD && body.password === process.env.ADMIN_PASSWORD;

  if (body.action === "login") {
    const r = authPlayer(state, body.user, body.pin, { create: true });
    if (r.error) return json({ error: r.error }, 401);
    await save(store, state);
    return json({ ...view(state), created: !!r.created });
  }

  // Confrontos: "current" troca os desta semana; "fila" guarda uma ou várias semanas futuras
  // Na fila, cada semana começa com uma linha "W12" (ou "Semana 12"). Sem cabeçalho, vale a próxima semana.
  if (body.action === "schedule") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    try {
      if (body.target === "current") {
        const parsed = parseSchedule(body.text ?? "", state.week, state.registry);
        for (const p of parsed.players) state.registry[p.id] = { id: p.id, name: p.name, team: p.team };
        ensureWallets(state, parsed.players, state.week);
        state.schedule = parsed;
      } else {
        const atual = nflDe(state, state.week);
        const partes = [];
        let corrente = null;
        for (const linha of String(body.text ?? "").split("\n")) {
          const m = linha.trim().match(/^(?:W|Semana)\s*(\d{1,2})\b/i);
          if (m && !linha.includes("|")) {
            corrente = { nfl: Number(m[1]), linhas: [] };
            partes.push(corrente);
          } else {
            if (!corrente) {
              corrente = { nfl: atual + 1, linhas: [] };
              partes.push(corrente);
            }
            corrente.linhas.push(linha);
          }
        }
        if (!partes.length) throw new Error("Cole os confrontos antes de salvar");
        const novas = partes.map((x) => {
          if (x.nfl <= atual) throw new Error(`W${x.nfl}: a fila só aceita semanas depois da atual (W${atual})`);
          const semana = weekFromIdx(weekIdx(state.week) + x.nfl - atual);
          try {
            return { nfl: x.nfl, ...parseSchedule(x.linhas.join("\n"), semana, state.registry) };
          } catch (err) {
            throw new Error(`W${x.nfl}: ${err.message}`);
          }
        });
        const nums = novas.map((x) => x.nfl);
        if (new Set(nums).size !== nums.length) throw new Error("A mesma semana apareceu duas vezes");
        state.fila = [...state.fila.filter((x) => !nums.includes(x.nfl)), ...novas].sort((x, y) => x.nfl - y.nfl);
        for (const x of novas) for (const p of x.players) state.registry[p.id] ??= { id: p.id, name: p.name, team: p.team };
      }
    } catch (err) {
      return json({ error: err.message }, 400);
    }
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "odds") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    // Valor vazio ou null apaga o ajuste manual e volta para a projeção
    const vazio = (v) => v === null || v === undefined || v === "";
    const fids = new Set(state.schedule.fixtures.map((f) => f.id));
    const pids = new Set(state.schedule.players.map((p) => p.id));
    const aplica = (mapa, alvo, valido, conv) => {
      for (const [k, v] of Object.entries(mapa ?? {})) {
        if (!valido.has(k)) continue;
        if (vazio(v)) { delete alvo[k]; continue; }
        const x = conv(Number(String(v).replace(",", ".")));
        if (x !== null) alvo[k] = x;
      }
    };
    const meio = (x) => (Number.isFinite(x) ? Math.round(x - 0.5) + 0.5 : null);
    aplica(body.valores, state.odds.valores, fids, (x) => (Number.isFinite(x) ? Math.min(P_MAX, Math.max(P_MIN, Math.round(x))) : null));
    aplica(body.handicap, state.odds.handicap, fids, meio);
    aplica(body.total, state.odds.total, pids, (x) => (Number.isFinite(x) && x > 0 ? meio(x) : null));
    const teto = configDe(state).tetoRodada;
    const oddOk = (x) => (Number.isFinite(x) ? Math.min(teto, Math.max(ODD_MIN, +x.toFixed(2))) : null);
    aplica(body.melhor, state.odds.melhor, pids, oddOk);
    aplica(body.pior, state.odds.pior, pids, oddOk);
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "congelarJogo") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    if (!state.schedule.fixtures.some((f) => f.id === body.fid)) return json({ error: "Confronto não encontrado" }, 400);
    const fids = new Set(state.congelados.fids);
    if (body.valor) fids.add(body.fid);
    else fids.delete(body.fid);
    state.congelados.fids = [...fids];
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "results") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const scores = body.scores ?? {};
    for (const f of state.schedule.fixtures) {
      const s = scores[f.id];
      if (!s || typeof s.a !== "number" || typeof s.b !== "number") continue;
      state.results[state.week][f.id] = { a: s.a, b: s.b, winner: s.a >= s.b ? "A" : "B", aId: f.a, bId: f.b };
    }
    settleWeek(state, state.week);
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "resultadoAlterar") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const scores = body.scores ?? {};
    revertWeek(state, state.week);
    for (const f of state.schedule.fixtures) {
      const s = scores[f.id];
      if (!s || !Number.isFinite(s.a) || !Number.isFinite(s.b)) continue;
      state.results[state.week][f.id] = { a: s.a, b: s.b, winner: s.a >= s.b ? "A" : "B", aId: f.a, bId: f.b };
    }
    settleWeek(state, state.week);
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "freeze") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    state.frozen = state.frozen === state.week ? null : state.week;
    await save(store, state);
    return json(view(state));
  }

  // Handicap e total de um jogo, sem mexer na vitória
  if (body.action === "fecharExtrasJogo") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    if (!state.schedule.fixtures.some((f) => f.id === body.fid)) return json({ error: "Confronto não encontrado" }, 400);
    const fids = new Set(state.extras.fids);
    if (body.valor) fids.add(body.fid);
    else fids.delete(body.fid);
    state.extras.fids = [...fids];
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "fecharRodada") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    state.rodadaFechada = state.rodadaFechada === state.week ? null : state.week;
    await save(store, state);
    return json(view(state));
  }

  // Margens, desvios e chance do over. Campo vazio volta para o padrão.
  if (body.action === "config") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    for (const [k, [min, max]] of Object.entries(CONFIG_LIMITES)) {
      const v = body.config?.[k];
      if (v === undefined) continue;
      if (v === null || v === "") { delete state.config[k]; continue; }
      const x = Number(String(v).replace(",", "."));
      if (!Number.isFinite(x)) return json({ error: `Valor inválido em ${k}` }, 400);
      state.config[k] = Math.min(max, Math.max(min, x));
    }
    await save(store, state);
    return json(view(state));
  }

  // Número da semana da NFL mostrado no app (só o rótulo, não mexe em nada)
  if (body.action === "semanaNfl") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const n = Math.round(Number(body.semana));
    const t = Math.round(Number(body.temporada ?? state.nfl.temporada));
    if (!Number.isInteger(n) || n < 1 || n > 30) return json({ error: "Semana inválida" }, 400);
    if (!Number.isInteger(t) || t < 2000) return json({ error: "Temporada inválida" }, 400);
    state.nfl = { base: state.week, semana: n, temporada: t };
    await save(store, state);
    return json(view(state));
  }

  // Fecha a semana e começa a próxima. Só acontece quando o admin aperta o botão.
  if (body.action === "avancarSemana") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    if (body.semanaAtual && body.semanaAtual !== state.week) return json({ error: "A semana já foi avançada. Recarregue a página." }, 409);
    const velha = state.week;
    const nova = nextWeekId(velha);
    // Bônus só para quem apostou pelo menos 1 GC na semana que está fechando
    const apostou = (w) =>
      w.history.some(
        (h) =>
          h.week === velha &&
          (((h.type === "bet" || h.type === "multi") && h.status !== "cancelled" && h.stake > 0) ||
            (h.type === "duel" && h.delta < 0))
      );
    const bonus = [];
    for (const [id, w] of Object.entries(state.wallets)) {
      if (!state.schedule.players.some((p) => p.id === id)) continue;
      if (!apostou(w)) continue;
      w.balance += WEEKLY_STIPEND;
      w.lastStipendWeek = nova;
      w.history.push({ type: "stipend", amount: WEEKLY_STIPEND, weekId: nova, week: nova });
      bonus.push(id);
    }
    state.week = nova;
    state.results[nova] ??= {};
    // Confrontos da fila: entra a semana da NFL que começa agora (as anteriores que sobraram são descartadas)
    const nflNova = nflDe(state, nova);
    const daVez = state.fila.find((x) => x.nfl === nflNova);
    state.fila = state.fila.filter((x) => x.nfl > nflNova);
    if (daVez) {
      state.schedule = { week: nova, players: daVez.players, fixtures: daVez.fixtures };
      for (const p of daVez.players) state.registry[p.id] = { id: p.id, name: p.name, team: p.team };
      ensureWallets(state, daVez.players, nova);
    } else if (state.pending) {
      state.schedule = { ...state.pending, week: nova };
    } else {
      state.schedule = { ...state.schedule, week: nova };
    }
    state.pending = null;
    await save(store, state);
    return json({ ...view(state), bonus, trocouConfrontos: !!daVez });
  }

  if (body.action === "filaRemover") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    state.fila = state.fila.filter((x) => x.nfl !== Number(body.nfl));
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "reopen") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const settled = Object.values(state.wallets).some((w) =>
      w.history.some((h) => h.week === state.week && (h.status === "won" || h.status === "lost"))
    );
    if (settled) return json({ error: "Há apostas já liquidadas nesta rodada. Use Alterar resultado." }, 400);
    state.results[state.week] = {};
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "resetPin") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    if (!state.auth[body.target]) return json({ error: "Este jogador ainda não tem PIN" }, 400);
    delete state.auth[body.target];
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "ajusteTabela") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    if (!state.registry[body.target]) return json({ error: "Jogador inválido" }, 400);
    const aj = {
      w: Math.round(Number(body.w) || 0),
      l: Math.round(Number(body.l) || 0),
      pf: Number(body.pf) || 0,
      pa: Number(body.pa) || 0,
    };
    if (aj.w === 0 && aj.l === 0 && aj.pf === 0 && aj.pa === 0) delete state.ajusteTabela[body.target];
    else state.ajusteTabela[body.target] = aj;
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "ajuste") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const w = state.wallets[body.target];
    const delta = Number(body.delta);
    const motivo = String(body.motivo ?? "").trim().slice(0, 80);
    if (!w) return json({ error: "Jogador inválido" }, 400);
    if (!Number.isInteger(delta) || delta === 0) return json({ error: "Informe um valor inteiro diferente de zero" }, 400);
    if (!motivo) return json({ error: "Informe um motivo curto" }, 400);
    w.balance += delta;
    w.history.push({ type: "ajuste", delta, desc: `Ajuste do admin: ${motivo}`, week: state.week });
    state.ajustes.push({ week: state.week, user: body.target, delta, motivo, em: Date.now() });
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "cancelarAposta") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const w = state.wallets[body.target];
    const idx = Number(body.index);
    const h = w?.history[idx];
    if (!h || (h.type !== "bet" && h.type !== "multi") || h.status !== "open") {
      return json({ error: "Aposta indisponível para cancelar" }, 400);
    }
    w.balance += h.stake;
    w.history[idx] = { ...h, status: "cancelled" };
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "settlePrevious") {
    if (!isAdmin) return json({ error: "Senha de admin inválida" }, 403);
    const week = semanaInterna(state, body.week);
    if (!week) return json({ error: "Semana inválida. Use o formato W7" }, 400);
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
    await save(store, state);
    return json(view(state));
  }

  // Daqui em diante, toda ação de jogador exige nome + PIN válidos
  const auth = authPlayer(state, body.user, body.pin);
  if (auth.error) return json({ error: auth.error }, 401);

  if (body.action === "emote") {
    const text = String(body.emote ?? "").trim();
    const graphemes = [...new Intl.Segmenter().segment(text)];
    if (graphemes.length !== 1 || text.length > 16) return json({ error: "Escolha exatamente 1 emoji" }, 400);
    state.emotes[body.user] = text;
    await save(store, state);
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
    await save(store, state);
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
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "duelRecusar") {
    const d = state.duels[body.duelId];
    if (!d || d.status !== "pendente") return json({ error: "Desafio indisponível" }, 400);
    if (body.user !== d.desafiado && body.user !== d.mediador) return json({ error: "Você não pode recusar este desafio" }, 400);
    cancelDuel(state, d, "recusado");
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "duelCancelar") {
    const d = state.duels[body.duelId];
    if (!d || d.status !== "pendente" || body.user !== d.desafiante) return json({ error: "Desafio indisponível" }, 400);
    cancelDuel(state, d, "cancelado");
    await save(store, state);
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
    await save(store, state);
    return json(view(state));
  }

  if (body.action === "bet") {
    if ((state.wallets[body.user]?.balance ?? 0) < 0) return json({ error: "Saldo negativo: você não pode apostar até zerar" }, 400);
    try {
      const leg = buildLeg(state, body);
      const w = state.wallets[body.user];
      if (RODADA.includes(leg.market)) {
        const ja = w.history.some(
          (h) => h.type === "bet" && h.week === state.week && h.market === leg.market && h.status !== "cancelled"
        );
        if (ja) return json({ error: `Você já apostou no ${leg.match} desta semana` }, 400);
      }
      const dup = !RODADA.includes(leg.market) && w.history.some(
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
      await save(store, state);
      return json(view(state));
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  }

  if (body.action === "multi") {
    if ((state.wallets[body.user]?.balance ?? 0) < 0) return json({ error: "Saldo negativo: você não pode apostar até zerar" }, 400);
    try {
      const items = Array.isArray(body.legs) ? body.legs : [];
      if (items.length < 2) throw new Error("A múltipla precisa de pelo menos 2 seleções");
      const ids = items.map((i) => i.fixtureId);
      if (items.some((i) => RODADA.includes(i.market))) throw new Error("Melhor e Odireston da rodada só valem em aposta simples");
      if (new Set(ids).size !== ids.length) throw new Error("Só é permitida uma seleção por confronto na múltipla");
      const legs = items.map((i) => buildLeg(state, i));
      const odd = +legs.reduce((acc, l) => acc * l.odd, 1).toFixed(2);
      const w = state.wallets[body.user];
      const nw = placeBet(w, body.stake, odd);
      const last = nw.history.length - 1;
      nw.history[last] = { ...nw.history[last], type: "multi", legs, week: state.week };
      state.wallets[body.user] = nw;
      await save(store, state);
      return json(view(state));
    } catch (err) {
      return json({ error: err.message }, 400);
    }
  }

  return json({ error: "Ação inválida" }, 400);
};
