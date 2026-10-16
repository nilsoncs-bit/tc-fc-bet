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
      const legs = slip.map(({ fixtureId, market, side, team }) => ({ fixtureId, market, side, team }));
      state = slip.length === 1
        ? await post({ action: "bet", ...legs[0], stake })
        : await post({ action: "multi", legs, stake });
      slip = [];
      alert("Aposta registrada!");
      render();
    } else if (el.hasAttribute("data-emote-save")) {
      state = await post({ action: "emote", emote: $("#emote").value });
      alert("Emote salvo.");
      render();
    } else if (el.hasAttribute("data-adminlogin")) {
      adminPw = $("#pw").value;
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
load();
