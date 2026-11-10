function pickLeg(fixtureId, market, side, team) {
  const key = (l) =>
    l.fixtureId === fixtureId && l.market === market && l.side === side && (l.team ?? null) === (team ?? null);
  if (slip.some(key)) {
    slip = slip.filter((l) => !key(l));
    return;
  }
  slip = slip.filter((l) => l.fixtureId !== fixtureId);
  slip.push({ fixtureId, market, side, team });
}

function atualizaBarra(s) {
  const a = document.getElementById("bA");
  const b = document.getElementById("bB");
  const o = document.getElementById("bOdds");
  if (!a || !b || !o) return;
  a.style.width = s + "%";
  b.style.width = 100 - s + "%";
  o.textContent = `Odd ${odd(100 / s)} · Odd ${odd(100 / (100 - s))}`;
}

document.addEventListener("click", async (e) => {
  const el = e.target.closest("button");
  if (!el) return;
  try {
    if (el.dataset.tab) {
      tab = el.dataset.tab;
      render();
    } else if (el.hasAttribute("data-login")) {
      await login($("#lname").value, $("#lpin").value.trim());
    } else if (el.dataset.action === "logout") {
      logout();
    } else if (el.dataset.pick) {
      pickLeg(el.dataset.pick, el.dataset.market, el.dataset.side, el.dataset.team);
      render();
    } else if (el.hasAttribute("data-clear")) {
      slip = [];
      render();
    } else if (el.hasAttribute("data-bet")) {
      if (!slip.length) return;
      const snapshot = slip.map((l) => ({ label: legLabel(l), odd: legOdd(l) }));
      const total = totalOdd();
      const apostado = stake;
      const legs = slip.map(({ fixtureId, market, side, team }) => ({ fixtureId, market, side, team }));
      const semana = state.week;
      state = slip.length === 1
        ? await post({ action: "bet", ...legs[0], stake })
        : await post({ action: "multi", legs, stake });
      slip = [];
      const num = (me()?.history ?? []).filter((h) => h.type === "bet" || h.type === "multi").length;
      recibo = { legs: snapshot, odd: total, stake: apostado, retorno: Math.floor(apostado * total), num, week: semana };
      render();
    } else if (el.hasAttribute("data-recibo-fechar")) {
      recibo = null;
      render();
    } else if (el.dataset.filtro) {
      filtroApostas = el.dataset.filtro;
      render();
    } else if (el.dataset.statEscopo) {
      statsEscopo = el.dataset.statEscopo;
      render();
    } else if (el.hasAttribute("data-theme-toggle")) {
      applyTheme(document.documentElement.dataset.theme === "light" ? "dark" : "light");
      render();
    } else if (el.hasAttribute("data-novidades")) {
      modalNov = { pagina: 0 };
      render();
    } else if (el.hasAttribute("data-nov-next")) {
      modalNov.pagina = Math.min(modalNov.pagina + 1, NOVIDADES.paginas.length - 1);
      render();
    } else if (el.hasAttribute("data-nov-prev")) {
      modalNov.pagina = Math.max(modalNov.pagina - 1, 0);
      render();
    } else if (el.hasAttribute("data-nov-fechar")) {
      localStorage.setItem("tcfc-novidades-visto", NOVIDADES.versao);
      modalNov = null;
      render();
    } else if (el.hasAttribute("data-emote-save")) {
      state = await post({ action: "emote", emote: $("#emote").value });
      alert("Emote salvo.");
      render();
    } else if (el.dataset.duelAccept) {
      state = await post({ action: "duelAccept", duelId: el.dataset.duelAccept });
      alert("Desafio aceito.");
      render();
    } else if (el.dataset.duelRecusar) {
      state = await post({ action: "duelRecusar", duelId: el.dataset.duelRecusar });
      alert("Desafio recusado. Valor devolvido.");
      render();
    } else if (el.dataset.duelCancelar) {
      state = await post({ action: "duelCancelar", duelId: el.dataset.duelCancelar });
      alert("Desafio cancelado. Valor devolvido.");
      render();
    } else if (el.hasAttribute("data-duel-novo")) {
      sheet = { tipo: "novo" };
      render();
    } else if (el.dataset.espec) {
      sheet = { tipo: "espec", duelId: el.dataset.espec };
      render();
    } else if (el.hasAttribute("data-sheet-fechar")) {
      sheet = null;
      render();
    } else if (el.hasAttribute("data-duel-enviar")) {
      const modo = $("#dMod").value;
      const body = { action: "duelCreate", desafiado: $("#dAdv").value, valor: Number($("#dVal").value), modo };
      if (modo === "barra") {
        body.mediador = $("#dMed").value;
        body.barra = Number($("#dBarra").value);
      }
      state = await post(body);
      sheet = null;
      alert("Desafio enviado.");
      render();
    } else if (el.hasAttribute("data-espec-enviar")) {
      state = await post({ action: "duelApostar", duelId: el.dataset.duel, side: $("#eLado").value, modo: $("#eMod").value, valor: Number($("#eVal").value) });
      sheet = null;
      alert("Aposta de espectador registrada.");
      render();
    } else if (el.hasAttribute("data-adminlogin")) {
      adminPw = $("#pw").value;
      render();
    } else if (el.hasAttribute("data-freeze")) {
      state = await post({ action: "freeze", password: adminPw }, false);
      alert(state.frozen ? "Todos os jogos congelados." : "Jogos liberados.");
      render();
    } else if (el.dataset.congelar) {
      const valor = el.dataset.valor === "1";
      state = await post({ action: "congelarJogo", password: adminPw, fid: el.dataset.congelar, valor }, false);
      render();
    } else if (el.hasAttribute("data-odds-save")) {
      const valores = {};
      document.querySelectorAll("input[data-odd]").forEach((i) => { valores[i.dataset.odd] = Number(i.value); });
      state = await post({ action: "odds", password: adminPw, valores }, false);
      alert("Odds salvas.");
      render();
    } else if (el.hasAttribute("data-aplicar-placares")) {
      const linhas = $("#placaresTexto").value.split("\n").map((l) => l.trim()).filter(Boolean);
      const scores = {};
      linhas.forEach((l, i) => {
        const nums = l.replace(/,/g, ".").split(/\s+/).map(Number);
        if (nums.length >= 2 && nums.every(Number.isFinite)) scores[`f${i + 1}`] = { a: nums[0], b: nums[1] };
      });
      if (!Object.keys(scores).length) throw new Error("Nenhum placar válido. Use o formato: 146.7 94.6");
      if (linhas.length !== state.fixtures.length && !confirm(`Você colou ${linhas.length} linhas e a rodada tem ${state.fixtures.length} jogos. Aplicar mesmo assim?`)) return;
      state = await post({ action: "resultadoAlterar", password: adminPw, scores }, false);
      alert("Placares aplicados e apostas liquidadas.");
      render();
    } else if (el.hasAttribute("data-ajuste")) {
      state = await post({
        action: "ajuste", password: adminPw,
        target: $("#ajUser").value, delta: Number($("#ajVal").value), motivo: $("#ajMotivo").value,
      }, false);
      alert("Ajuste aplicado.");
      render();
    } else if (el.dataset.cancelar) {
      const [target, index] = el.dataset.cancelar.split("|");
      if (!confirm("Cancelar esta aposta? O valor volta para o saldo do jogador.")) return;
      state = await post({ action: "cancelarAposta", password: adminPw, target, index: Number(index) }, false);
      alert("Aposta cancelada.");
      render();
    } else if (el.hasAttribute("data-reopen")) {
      if (!confirm("Reabrir os confrontos desta rodada? Os placares lançados nela serão apagados.")) return;
      state = await post({ action: "reopen", password: adminPw }, false);
      alert("Confrontos reabertos.");
      render();
    } else if (el.hasAttribute("data-reset-pin")) {
      const target = $("#resetSel").value;
      if (!confirm("Apagar o PIN deste jogador? Ele cria um novo no próximo acesso.")) return;
      state = await post({ action: "resetPin", password: adminPw, target }, false);
      alert("PIN apagado.");
      render();
    } else if (el.hasAttribute("data-settle-prev")) {
      const week = $("#prevWeek").value.trim();
      const text = $("#prevText").value;
      const scores = {};
      $("#prevScores").value
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .forEach((l, i) => {
          const [a, b] = l.replace(/,/g, ".").split(/\s+/).map(Number);
          scores[`f${i + 1}`] = { a, b };
        });
      state = await post({ action: "settlePrevious", password: adminPw, week, text, scores }, false);
      alert("Rodada anterior liquidada.");
      render();
    } else if (el.hasAttribute("data-schedule")) {
      state = await post({ action: "schedule", password: adminPw, target: $("#target").value, text: $("#sched").value }, false);
      alert("Confrontos salvos.");
      render();
    } else if (el.hasAttribute("data-save")) {
      const scores = {};
      document.querySelectorAll("input[data-fid]").forEach((i) => {
        const id = i.dataset.fid;
        scores[id] ??= {};
        if (i.value !== "") scores[id][i.dataset.side] = Number(i.value);
      });
      state = await post({ action: "resultadoAlterar", password: adminPw, scores }, false);
      alert("Resultados salvos e apostas liquidadas.");
      render();
    }
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id === "stake") {
    stake = Math.max(0, Math.floor(Number(e.target.value) || 0));
    const pot = document.getElementById("pot");
    if (pot) pot.textContent = Math.floor(stake * totalOdd());
  }
  if (e.target.id === "dBarra") atualizaBarra(Number(e.target.value));
  if (e.target.dataset && e.target.dataset.odd) {
    const fid = e.target.dataset.odd;
    const p = Number(e.target.value);
    const o = oddsPrevia(p);
    const txt = document.querySelector(`[data-odd-txt="${fid}"]`);
    if (txt) txt.textContent = `${p}% · odd ${odd(o.oddA)} · ${100 - p}% · odd ${odd(o.oddB)} · handicap ${sinal(o.linha)}`;
  }
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "dMod") {
    const barra = t.value === "barra";
    const med = document.getElementById("linhaMed");
    const bar = document.getElementById("linhaBarra");
    if (med) med.style.display = barra ? "" : "none";
    if (bar) bar.style.display = barra ? "" : "none";
  }
  if (t.id === "dAdv") {
    const eu = me();
    const adv = state.players.find((p) => p.id === t.value);
    if (!eu || !adv) return;
    const s = barraSugerida(eu.projection, adv.projection);
    const barra = document.getElementById("dBarra");
    const nomeB = document.getElementById("bNomeB");
    if (barra) barra.value = s;
    if (nomeB) nomeB.textContent = adv.name;
    atualizaBarra(s);
  }
});

window.addEventListener("focus", load);
initTheme();
setTimeout(() => { splash = false; render(); }, 1600);
load();
