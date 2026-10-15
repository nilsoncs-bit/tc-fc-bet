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
      const same = slip && slip.fixtureId === el.dataset.pick && slip.side === el.dataset.side;
      slip = same ? null : { fixtureId: el.dataset.pick, side: el.dataset.side, stake: 10 };
      render();
    } else if (el.hasAttribute("data-bet")) {
      state = await post({ action: "bet", fixtureId: slip.fixtureId, side: slip.side, stake: slip.stake });
      slip = null;
      alert("Aposta registrada!");
      render();
    } else if (el.hasAttribute("data-adminlogin")) {
      adminPw = $("#pw").value;
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
      state = await post({ action: "results", password: adminPw, scores }, false);
      alert("Resultados salvos e apostas liquidadas.");
      render();
    }
  } catch (err) {
    alert(err.message);
  }
});

document.addEventListener("input", (e) => {
  if (e.target.id !== "stake" || !slip) return;
  slip.stake = Math.max(0, Math.floor(Number(e.target.value) || 0));
  const f = fx(slip.fixtureId);
  const o = slip.side === "A" ? f.oddA : f.oddB;
  $("#pot").textContent = Math.floor(slip.stake * o);
});

window.addEventListener("focus", load);
load();
