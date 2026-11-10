function admin() {
  if (!adminPw) {
    return `
    <h2 class="section">Admin</h2>
    <section class="card pad">
      <input class="pw" id="pw" type="password" placeholder="Senha de admin">
      <button class="btn" data-adminlogin>ENTRAR</button>
    </section>`;
  }
  const opcoesJogadores = state.players.map((p) => `<option value="${p.id}">${p.emote} ${p.name}</option>`).join("");
  return `
  <h2 class="section">Controles</h2>
  <section class="card pad">
    <p class="muted">Rodada ${state.week}: ${state.frozen ? "<b>todos os jogos congelados</b>" : "apostas abertas"}</p>
    <button class="btn" data-freeze>${state.frozen ? "LIBERAR TODOS" : "CONGELAR TODOS"}</button>
    <br><br>
    <button class="btn" data-reopen>REABRIR CONFRONTOS DA RODADA</button>
  </section>

  <h2 class="section">Confrontos</h2>
  <section class="card pad">
    <div class="row"><select id="target">
      <option value="next">Próxima semana</option>
      <option value="current">Esta semana (${state.week})</option>
    </select></div>
    <textarea id="sched" placeholder="Nome | Time | Projeção
Nome | Time | Projeção

Nome | Time | Projeção
Nome | Time | Projeção"></textarea>
    <p class="muted">Cada confronto são 2 linhas. Separe os confrontos com uma linha em branco.
      ${state.pendingWeek ? `Próxima semana já definida para ${state.pendingWeek}.` : ""}</p>
    <button class="btn" data-schedule>SALVAR CONFRONTOS</button>
  </section>

  <h2 class="section">Odds da rodada</h2>
  ${oddsSecao()}

  <h2 class="section">Resultados — ${state.week}</h2>
  <section class="card pad">
    <p class="muted">Cole os placares, um por linha, na ordem dos confrontos (ex.: 146.7 94.6).</p>
    <textarea id="placaresTexto" placeholder="146.7 94.6"></textarea>
    <button class="btn" data-aplicar-placares>APLICAR PLACARES</button>
    <p class="muted">Ou digite direto:</p>
    ${state.fixtures.map((f) => `
      <div class="row">
        <span>${f.a} x ${f.b}</span>
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="a" value="${f.result?.a ?? ""}">
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="b" value="${f.result?.b ?? ""}">
      </div>`).join("")}
    <button class="btn" data-save>SALVAR E LIQUIDAR</button>
    <p class="muted">Se a rodada já tinha placar, corrige e refaz os pagamentos.</p>
  </section>

  <h2 class="section">Modo admin</h2>
  <section class="card pad">
    <p class="muted">Ajuste de saldo. Aparece para todos, com o motivo.</p>
    <div class="row"><select id="ajUser">${opcoesJogadores}</select></div>
    <div class="row"><input id="ajVal" type="number" step="1" placeholder="+50 ou -30"></div>
    <div class="row"><input class="pw" id="ajMotivo" placeholder="Motivo curto"></div>
    <button class="btn" data-ajuste>APLICAR AJUSTE</button>
  </section>
  <section class="card pad">
    <p class="muted">Apostas em aberto. Cancelar devolve o valor apostado.</p>
    ${apostasAbertas()}
  </section>

  <h2 class="section">Resetar PIN</h2>
  <section class="card pad">
    <div class="row"><select id="resetSel">${opcoesJogadores}</select></div>
    <button class="btn" data-reset-pin>RESETAR PIN</button>
  </section>

  <h2 class="section">Liquidar rodada anterior</h2>
  <section class="card pad">
    <div class="row"><input class="pw" id="prevWeek" placeholder="Ex.: 2026-W43"></div>
    <textarea id="prevText" placeholder="Confrontos da rodada anterior, no mesmo formato do Confrontos"></textarea>
    <textarea id="prevScores" placeholder="Um placar por linha, na mesma ordem dos confrontos:
118.5 96.4"></textarea>
    <p class="muted">Use ponto no lugar da vírgula nos placares.</p>
    <button class="btn" data-settle-prev>LIQUIDAR RODADA ANTERIOR</button>
  </section>`;
}

// Mesma conta do servidor, só para mostrar a odd enquanto a barra é movida
function invNormalFront(p) {
  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));
  const z = t - (2.515517 + 0.802853 * t + 0.010328 * t * t) /
    (1 + 1.432788 * t + 0.189269 * t * t + 0.001308 * t * t * t);
  return p < 0.5 ? -z : z;
}

function oddsPrevia(pInt) {
  const p = pInt / 100;
  const lim = (x) => Math.min(20, Math.max(1.05, +x.toFixed(2)));
  const oddDe = (q) => lim(1 / (q * 1.05));
  const linha = Math.round(-(38 * Math.SQRT2 * invNormalFront(p)) - 0.5) + 0.5;
  return { oddA: oddDe(p), oddB: oddDe(1 - p), linha };
}

function oddsSecao() {
  const congelados = state.congelados || [];
  return `
  <section class="card pad">
    <p class="muted">A barra é a chance do time da esquerda. A odd aparece enquanto você mexe. Apostas já feitas não mudam.</p>
    ${state.fixtures.map((f) => {
      const p = state.odds?.[f.id] ?? 50;
      const o = oddsPrevia(p);
      const travado = congelados.includes(f.id);
      return `
      <div class="odd-bloco">
        <div class="row"><b>${f.aEmote} ${f.a} x ${f.bEmote} ${f.b}</b></div>
        <div class="barra-nomes"><span>${f.a}</span><span>${f.b}</span></div>
        <input type="range" min="5" max="95" value="${p}" data-odd="${f.id}">
        <div class="muted" data-odd-txt="${f.id}">${p}% · odd ${odd(o.oddA)} · ${100 - p}% · odd ${odd(o.oddB)} · handicap ${sinal(o.linha)}</div>
        <div class="row">
          <span class="muted">${f.result ? "encerrado" : travado ? "congelado" : "aberto"}</span>
          <button class="pill" data-congelar="${f.id}" data-valor="${travado ? "0" : "1"}">${travado ? "LIBERAR JOGO" : "CONGELAR JOGO"}</button>
        </div>
      </div>`;
    }).join("")}
    <button class="btn" data-odds-save>SALVAR ODDS</button>
  </section>`;
}

function apostasAbertas() {
  const linhas = state.players.flatMap((p) =>
    p.history
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => (h.type === "bet" || h.type === "multi") && h.status === "open")
      .map(({ h, i }) => `
        <div class="row">
          <span>${p.emote} ${p.name}: ${h.type === "multi" ? `múltipla de ${h.legs.length}` : (h.pick ?? h.side)} · ${h.stake} GC</span>
          <button class="pill" data-cancelar="${p.id}|${i}">CANCELAR</button>
        </div>`));
  return linhas.length ? linhas.join("") : `<p class="muted">Nenhuma aposta em aberto.</p>`;
}
