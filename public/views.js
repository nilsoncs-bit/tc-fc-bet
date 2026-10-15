function loginView() {
  return `
  <h2 class="section">ENTRAR</h2>
  <section class="card pad">
    <div class="row"><select id="lname">${state.players.map((p) => `<option value="${p.id}">${p.name}</option>`).join("")}</select></div>
    <div class="row"><input id="lpin" class="pw" type="password" inputmode="numeric" maxlength="6" placeholder="PIN (4 a 6 números)"></div>
    <button class="btn" data-login>ENTRAR</button>
    <p class="muted">Primeiro acesso: o PIN que você digitar agora fica salvo para os próximos.</p>
    ${loginMsg ? `<p>${loginMsg}</p>` : ""}
  </section>`;
}

function mercados() {
  return `
  <h2 class="section">MERCADOS DA SEMANA</h2>
  <section class="card">
    <div class="card-head"><b>CLASSIC</b><span>${state.fixtures.length} confrontos</span></div>
    <div class="sub">VENCEDOR DO CONFRONTO</div>
    <div class="grid">
      ${state.fixtures.map((f) => {
        const closed = !!f.result;
        return `
        <button class="odd ${isSel(f.id, "A")}" data-pick="${f.id}" data-side="A" ${closed ? "disabled" : ""}><span>${f.a}</span><em>${odd(f.oddA)}</em></button>
        <button class="odd ${isSel(f.id, "B")}" data-pick="${f.id}" data-side="B" ${closed ? "disabled" : ""}><span>${f.b}</span><em>${odd(f.oddB)}</em></button>`;
      }).join("")}
    </div>
  </section>`;
}

function slipView() {
  const f = fx(slip.fixtureId);
  if (!f) return "";
  const pick = slip.side === "A" ? f.a : f.b;
  const o = slip.side === "A" ? f.oddA : f.oddB;
  return `
  <div class="slip">
    <div class="info"><b>${pick}</b> @ ${odd(o)}<div class="muted">Retorno possível: <span id="pot">${Math.floor(slip.stake * o)}</span> GC</div></div>
    <input id="stake" type="number" min="1" step="1" value="${slip.stake}">
    <button class="btn" data-bet>APOSTAR</button>
  </div>`;
}

function tabela() {
  const rows = state.standings
    .map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${r.team}<div class="muted">${r.name}</div></td>
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
  <p class="muted">% de playoffs é uma estimativa por simulação dos jogos restantes.</p>`;
}

function placar() {
  const rows = [...state.players]
    .sort((a, b) => b.balance - a.balance)
    .map((p, i) => `<tr><td>${i + 1}</td><td>${p.name}<div class="muted">${p.team}</div></td><td class="num">${p.balance}</td></tr>`)
    .join("");
  return `
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
    Escolha um lado de cada confronto e aposte. A odd é calculada pelas projeções de pontos dos titulares.<br>
    Quando o admin lança o placar final, as apostas são liquidadas: se acertar, você recebe stake × odd.<br>
    Em caso de empate no placar, o lado A vence.<br>
    Game Coins são virtuais: não podem ser convertidos, trocados ou sacados por dinheiro.
  </section>`;
}
