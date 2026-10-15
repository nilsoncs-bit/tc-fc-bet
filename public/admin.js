function admin() {
  if (!adminPw) {
    return `
    <h2 class="section">ADMIN</h2>
    <section class="card pad">
      <input class="pw" id="pw" type="password" placeholder="Senha de admin">
      <button class="btn" data-adminlogin>ENTRAR</button>
    </section>`;
  }
  return `
  <h2 class="section">CONFRONTOS</h2>
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

  <h2 class="section">RESULTADOS — ${state.week}</h2>
  <section class="card pad">
    ${state.fixtures.map((f) => `
      <div class="row">
        <span>${f.a} x ${f.b}</span>
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="a" value="${f.result?.a ?? ""}">
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="b" value="${f.result?.b ?? ""}">
      </div>`).join("")}
    <button class="btn" data-save>SALVAR E LIQUIDAR</button>
  </section>`;
}
