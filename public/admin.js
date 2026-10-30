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
    <p class="muted">Rodada ${state.week}: ${state.frozen ? "<b>apostas congeladas</b>" : "apostas abertas"}</p>
    <button class="btn" data-freeze>${state.frozen ? "LIBERAR APOSTAS" : "CONGELAR APOSTAS"}</button>
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

  <h2 class="section">Ao vivo: progresso por time</h2>
  ${liveSection()}

  <h2 class="section">Resultados — ${state.week}</h2>
  <section class="card pad">
    ${state.fixtures.map((f) => `
      <div class="row">
        <span>${f.a} x ${f.b}</span>
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="a" value="${f.result?.a ?? ""}">
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="b" value="${f.result?.b ?? ""}">
      </div>`).join("")}
    <button class="btn" data-save>SALVAR E LIQUIDAR</button>
    <p class="muted">Se a rodada já tinha placar lançado, este botão corrige e refaz os pagamentos.</p>
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

function liveSection() {
  return `
  <section class="card pad">
    <p class="muted">Para cada time que já começou a jogar: % da projeção já jogada e pontos atuais. Times que não jogaram ficam em branco.</p>
    ${state.fixtures.map((f) => `
      <div class="row"><b>${f.a} x ${f.b}</b></div>
      ${["a", "b"].map((t) => {
        const nome = t === "a" ? f.a : f.b;
        const v = f.live?.[t];
        return `
        <div class="row">
          <span>${nome}</span>
          <input class="score" type="number" min="0" max="100" placeholder="%" data-live="${f.id}" data-side="${t}" data-campo="pct" value="${v ? Math.round(v.pct * 100) : ""}">
          <input class="score" type="number" step="0.1" placeholder="pts" data-live="${f.id}" data-side="${t}" data-campo="pts" value="${v ? v.pts : ""}">
        </div>`;
      }).join("")}`).join("")}
    <button class="btn" data-live-save>ATUALIZAR ODDS</button>
  </section>`;
}
