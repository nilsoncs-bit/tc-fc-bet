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
        if ($("#dBarra").value !== "") body.barra = Number($("#dBarra").value);
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
      alert(state.frozen ? "Apostas congeladas." : "Apostas liberadas.");
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
    } else if (el.hasAttribute("data-live-save")) {
      const points = {};
      document.querySelectorAll("input[data-live]").forEach((i) => {
        const id = i.dataset.live;
        points[id] ??= {};
        if (i.value !== "") points[id][i.dataset.side] = Number(i.value);
      });
      state = await post({ action: "live", password: adminPw, progress: Number($("#prog").value), points }, false);
      alert("Odds atualizadas.");
      render();
    } else if (el.hasAttribute("data-save")) {
      const scores = {};
      document.querySelectorAll("input[data-fid]").forEach((i) => {
        const id = i.dataset.fid;
        scores[id] ??= {};
        if (i.value !== "") scores[id][i.dataset.side] = Number(i.value);
      });
      state = await post({ action: "results", password: adminPw, scores }, false);
      alert("Resultados salvos e apostas liquidadas.");
      render();
    }
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id !== "stake") return;
  stake = Math.max(0, Math.floor(Number(e.target.value) || 0));
  const pot = document.getElementById("pot");
  if (pot) pot.textContent = Math.floor(stake * totalOdd());
});

window.addEventListener("focus", load);
initTheme();
load();
