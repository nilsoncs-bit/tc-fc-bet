function loginView() {
  return `
  <h2 class="section">ENTRAR</h2>
  <section class="card pad">
    <div class="row"><select id="lname">${state.players.map((p) => `<option value="${p.id}">${p.emote} ${p.name}</option>`).join("")}</select></div>
    <div class="row"><input id="lpin" class="pw" type="password" inputmode="numeric" maxlength="6" placeholder="PIN (4 a 6 números)"></div>
    <button class="btn" data-login>ENTRAR</button>
    <p class="muted">Primeiro acesso: o PIN que você digitar agora fica salvo para os próximos.</p>
    ${loginMsg ? `<p>${loginMsg}</p>` : ""}
  </section>`;
}

function mercados() {
  const prog = state.progress
    ? `<p class="muted">Semana ${Math.round(state.progress * 100)}% concluída: odds ajustadas ao vivo. Apostas já feitas não mudam.</p>`
    : "";
  return `
  <h2 class="section">MERCADOS DA SEMANA</h2>
  ${prog}
  <section class="card">
    <div class="card-head"><b>VENCEDOR DO CONFRONTO</b><span>${state.fixtures.length} confrontos</span></div>
    <div class="grid">
      ${state.fixtures.map((f) => {
        const closed = f.result ? "disabled" : "";
        return `
        <button class="odd ${isSel(f.id, "ml", "A")}" data-pick="${f.id}" data-market="ml" data-side="A" ${closed}><span>${f.aEmote} ${f.a}</span><em>${odd(f.oddA)}</em></button>
        <button class="odd ${isSel(f.id, "ml", "B")}" data-pick="${f.id}" data-market="ml" data-side="B" ${closed}><span>${f.bEmote} ${f.b}</span><em>${odd(f.oddB)}</em></button>`;
      }).join("")}
    </div>
  </section>
  <section class="card">
    <div class="card-head"><b>PONTOS POR EQUIPE</b><span>mais / menos</span></div>
    <div class="grid">
      ${state.fixtures.map((f) => ["a", "b"].map((t) => teamButtons(f, t)).join("")).join("")}
    </div>
  </section>`;
}

function teamButtons(f, t) {
  const m = f.tot[t];
  const name = t === "a" ? `${f.aEmote} ${f.a}` : `${f.bEmote} ${f.b}`;
  const closed = f.result ? "disabled" : "";
  return `
  <button class="odd ${isSel(f.id, "tot", "O", t)}" data-pick="${f.id}" data-market="tot" data-team="${t}" data-side="O" ${closed}><span>${name}<br><small class="muted">Mais de ${num1(m.line)}</small></span><em>${odd(m.oddO)}</em></button>
  <button class="odd ${isSel(f.id, "tot", "U", t)}" data-pick="${f.id}" data-market="tot" data-team="${t}" data-side="U" ${closed}><span>${name}<br><small class="muted">Menos de ${num1(m.line)}</small></span><em>${odd(m.oddU)}</em></button>`;
}

function legOdd(l) {
  const f = fx(l.fixtureId);
  if (l.market === "tot") return l.side === "O" ? f.tot[l.team].oddO : f.tot[l.team].oddU;
  return l.side === "A" ? f.oddA : f.oddB;
}

function legLabel(l) {
  const f = fx(l.fixtureId);
  if (l.market === "tot") {
    const name = l.team === "a" ? `${f.aEmote} ${f.a}` : `${f.bEmote} ${f.b}`;
    return `${name}: ${l.side === "O" ? "mais" : "menos"} de ${num1(f.tot[l.team].line)}`;
  }
  return l.side === "A" ? `${f.aEmote} ${f.a}` : `${f.bEmote} ${f.b}`;
}

function totalOdd() {
  return +slip.reduce((acc, l) => acc * legOdd(l), 1).toFixed(2);
}

function slipView() {
  const total = totalOdd();
  return `
  <div class="slip">
    <div class="info">
      ${slip.map((l) => `<div>${legLabel(l)} <b>${odd(legOdd(l))}</b></div>`).join("")}
      <div class="muted">${slip.length > 1 ? `Múltipla de ${slip.length} · ` : ""}Odd total <b>${odd(total)}</b> · Retorno: <span id="pot">${Math.floor(stake * total)}</span> GC</div>
    </div>
    <input id="stake" type="number" min="1" step="1" value="${stake}">
    <button class="btn" data-bet>APOSTAR</button>
    <button class="pill" data-clear>LIMPAR</button>
  </div>`;
}

function tabela() {
  const rows = state.standings
    .map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.emote} ${r.team}<div class="muted">${r.name}</div></td>
        <td class="num">${r.w}-${r.l}</td>
        <td class="num">${r.pct}</td>
        <td class="num">${num1(r.pf)}</td>
        <td class="num">${num1(r.pa)}</td>
        <td class="num">${r.playoff}%</td>
      </tr>`)
    .join("");
  return `
  <h2 class="section">TABELA</h2>
  <section class="card" style="overflow-x:auto">
    <table>
      <tr><th>#</th><th>Time</th><th class="num">W-L</th><th class="num">WIN%</th><th class="num">PF</th><th class="num">PA</th><th class="num">PLAYOFF</th></tr>
      ${rows}
    </table>
  </section>
  <p class="muted">% de playoffs é uma estimativa: os jogos restantes são simulados com a projeção de cada time.</p>`;
}

function placar() {
  const rows = [...state.players]
    .sort((a, b) => b.balance - a.balance)
    .map((p, i) => `<tr><td>${i + 1}</td><td>${p.emote} ${p.name}<div class="muted">${p.team}</div></td><td class="num">${p.balance}</td></tr>`)
    .join("");
  const mine = me();
  const emoteForm = mine
    ? `<section class="card pad"><div class="row"><span>Seu emote</span><input id="emote" class="score" maxlength="4" value="${mine.emote}"><button class="btn" data-emote-save>SALVAR</button></div></section>`
    : "";
  return `
  ${emoteForm}
  <h2 class="section">PLACAR</h2>
  <section class="card"><table>
    <tr><th>#</th><th>Jogador</th><th class="num">GC</th></tr>${rows}
  </table></section>`;
}

function regras() {
  return `
  <h2 class="section">REGRAS</h2>
  <section class="card pad">
    Cada jogador começa com <b>1000 Game Coins</b> e recebe <b>100 GC por semana</b>.<br>
    Escolha vencedor do confronto ou pontos por equipe (mais de / menos de a linha da equipe).<br>
    A linha da equipe é a projeção arredondada para baixo, mais 0,5. O menos de tem odd fixa de 2,10.<br>
    Múltipla: escolha 2 ou mais seleções, uma por confronto. A odd total é a multiplicação das odds. Se uma perna perder, a múltipla perde.<br>
    Quando o admin lança o placar final, as apostas são liquidadas.<br>
    Em caso de empate no placar, o lado A vence.<br>
    Game Coins são virtuais: não podem ser convertidos, trocados ou sacados por dinheiro.
  </section>`;
}

function statusBadge(h) {
  if (h.status === "open") return `<span class="badge open">EM ABERTO</span>`;
  return h.status === "won" ? `<span class="badge won">GANHOU</span>` : `<span class="badge lost">PERDEU</span>`;
}

function betCard(h) {
  const isMulti = h.type === "multi";
  const title = isMulti ? `Múltipla de ${h.legs.length}` : "Aposta simples";
  const legs = isMulti ? h.legs : [h];
  const rows = legs.map((l) => {
    const f = state.fixtures.find((x) => x.id === l.fixtureId && h.week === state.week);
    const score = f?.result ? ` · placar ${f.result.a} x ${f.result.b}` : "";
    return `<div class="leg">
      <div class="muted">${l.match ?? "Confronto antigo"}</div>
      <div><b>${l.pick ?? l.side}</b> @ ${odd(l.odd)}${score}</div>
    </div>`;
  }).join("");
  let money;
  if (h.status === "open") money = `Retorno possível: <b>${Math.floor(h.stake * h.odd)} GC</b>`;
  else if (h.status === "won") money = `Recebeu: <b>${h.payout} GC</b>`;
  else money = `Perdeu: <b>${h.stake} GC</b>`;
  return `
  <section class="card pad bet">
    <div class="row"><b>${title}</b><span class="muted">${h.week}</span>${statusBadge(h)}</div>
    ${rows}
    <div class="row"><span>Apostado: <b>${h.stake} GC</b> · Odd total <b>${odd(h.odd)}</b></span></div>
    <div class="row"><span>${money}</span></div>
  </section>`;
}

function minhasApostas() {
  const u = me();
  if (!u) return loginView();
  const hist = u.history.slice().reverse();
  const bets = hist.filter((h) => h.type === "bet" || h.type === "multi");
  const stip = hist.filter((h) => h.type === "stipend");
  const open = bets.filter((h) => h.status === "open");
  const settled = bets.filter((h) => h.status === "won" || h.status === "lost");
  const staked = settled.reduce((s, h) => s + h.stake, 0);
  const paid = settled.reduce((s, h) => s + (h.payout ?? 0), 0);
  const wins = settled.filter((h) => h.status === "won").length;
  const openStake = open.reduce((s, h) => s + h.stake, 0);
  const net = paid - staked;
  return `
  <h2 class="section">MINHAS APOSTAS</h2>
  <section class="card pad">
    <div class="row"><span>Saldo</span><b>${u.balance} GC</b></div>
    <div class="row"><span>Em aberto</span><b>${open.length} aposta(s) · ${openStake} GC</b></div>
    <div class="row"><span>Acertos</span><b>${wins} de ${settled.length}</b></div>
    <div class="row"><span>Apostado (encerradas)</span><b>${staked} GC</b></div>
    <div class="row"><span>Recebido</span><b>${paid} GC</b></div>
    <div class="row"><span>Lucro líquido</span><b class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : ""}${net} GC</b></div>
  </section>

  <h2 class="section">APOSTAS</h2>
  ${bets.length ? bets.map(betCard).join("") : `<section class="card pad muted">Você ainda não fez apostas.</section>`}

  <h2 class="section">BÔNUS SEMANAL</h2>
  <section class="card pad">
    ${stip.length ? stip.map((s) => `<div class="row"><span>${s.weekId}</span><b>+${s.amount} GC</b></div>`).join("") : `<span class="muted">Nenhum bônus ainda.</span>`}
  </section>`;
}
