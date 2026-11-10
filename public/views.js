function loginView() {
  return `
  <img src="escudo.png" class="logo-md" alt="Top Caraio FC">
  <section class="card pad">
    <div class="row"><select id="lname">${state.players.map((p) => `<option value="${p.id}">${p.emote} ${p.name}</option>`).join("")}</select></div>
    <div class="row"><input id="lpin" class="pw" type="password" inputmode="numeric" maxlength="6" placeholder="PIN (4 a 6 números)"></div>
    <button class="btn" data-login style="width:100%">ENTRAR</button>
    <p class="muted">Primeiro acesso: o PIN que você digitar agora fica salvo para os próximos.</p>
    ${loginMsg ? `<p>${loginMsg}</p>` : ""}
  </section>`;
}

const bloqueado = (f) => (f.result || f.bloqueado ? "disabled" : "");

const sinal = (x) => (x > 0 ? "+" : "") + num1(x);

function mercados() {
  const aviso = state.frozen ? `<p class="aviso">Apostas congeladas nesta rodada.</p>` : "";
  const ativos = state.duels.filter((d) => d.status === "ativo");
  return `
  <div class="topo-mercados">
    <span class="chip-status ${state.frozen ? "fechado" : "aberto"}">${state.frozen ? "Congeladas" : "Apostas abertas"}</span>
    <span class="muted"> · ${state.week}</span>
  </div>
  ${aviso}
  ${ativos.length ? `<h2 class="section">Duelos ativos</h2>${ativos.map(duelCard).join("")}` : ""}
  <h2 class="section">Vencedor</h2>
  <section class="card"><div class="grid">
    ${state.fixtures.map((f) => `
      <button class="odd ${isSel(f.id, "ml", "A")}" data-pick="${f.id}" data-market="ml" data-side="A" ${bloqueado(f)}><span>${f.aEmote} ${f.a}<br><small class="muted">${f.pA}% de chance</small></span><em>${odd(f.oddA)}</em></button>
      <button class="odd ${isSel(f.id, "ml", "B")}" data-pick="${f.id}" data-market="ml" data-side="B" ${bloqueado(f)}><span>${f.bEmote} ${f.b}<br><small class="muted">${f.pB}% de chance</small></span><em>${odd(f.oddB)}</em></button>`).join("")}
  </div></section>
  <h2 class="section">Handicap</h2>
  <section class="card"><div class="grid">
    ${state.fixtures.map((f) => `
      <button class="odd ${isSel(f.id, "hc", "A")}" data-pick="${f.id}" data-market="hc" data-side="A" ${bloqueado(f)}><span>${f.aEmote} ${f.a}<br><small class="muted">${sinal(f.handicap.linha)}</small></span><em>${odd(f.handicap.oddA)}</em></button>
      <button class="odd ${isSel(f.id, "hc", "B")}" data-pick="${f.id}" data-market="hc" data-side="B" ${bloqueado(f)}><span>${f.bEmote} ${f.b}<br><small class="muted">${sinal(-f.handicap.linha)}</small></span><em>${odd(f.handicap.oddB)}</em></button>`).join("")}
  </div></section>
  ${duelosSecao()}`;
}

function legOdd(l) {
  const f = fx(l.fixtureId);
  if (l.market === "hc") return l.side === "A" ? f.handicap.oddA : f.handicap.oddB;
  return l.side === "A" ? f.oddA : f.oddB;
}

function legLabel(l) {
  const f = fx(l.fixtureId);
  if (l.market === "hc") {
    const nome = l.side === "A" ? `${f.aEmote} ${f.a}` : `${f.bEmote} ${f.b}`;
    const linha = l.side === "A" ? l.line : -l.line;
    return `${nome} ${sinal(linha)}`;
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

function statusBadge(h) {
  if (h.status === "open") return `<span class="badge open">EM ABERTO</span>`;
  if (h.status === "cancelled") return `<span class="badge open">CANCELADA</span>`;
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
  else if (h.status === "cancelled") money = `Cancelada: <b>${h.stake} GC</b> devolvidos`;
  else money = `Perdeu: <b>${h.stake} GC</b>`;
  return `
  <section class="card bet">
    <div class="row"><b>${title}</b><span class="muted">${h.week}</span>${statusBadge(h)}</div>
    ${rows}
    <div class="row"><span>Apostado: <b>${h.stake} GC</b> · Odd total <b>${odd(h.odd)}</b></span></div>
    <div class="row"><span>${money}</span></div>
  </section>`;
}

function apostas() {
  const u = me();
  if (!u) return loginView();
  const bets = u.history.slice().reverse().filter((h) => h.type === "bet" || h.type === "multi");
  const abertas = bets.filter((h) => h.status === "open");
  const settled = bets.filter((h) => h.status === "won" || h.status === "lost");
  const staked = settled.reduce((s, h) => s + h.stake, 0);
  const paid = settled.reduce((s, h) => s + (h.payout ?? 0), 0);
  const wins = settled.filter((h) => h.status === "won").length;
  const net = paid - staked;
  const openStake = abertas.reduce((s, h) => s + h.stake, 0);
  const filtradas = bets.filter((h) => {
    if (filtroApostas === "abertas") return h.status === "open";
    if (filtroApostas === "ganhas") return h.status === "won";
    if (filtroApostas === "perdidas") return h.status === "lost";
    return true;
  });
  const chips = [["todas", "Todas"], ["abertas", "Em aberto"], ["ganhas", "Ganhas"], ["perdidas", "Perdidas"]]
    .map(([k, l]) => `<button class="chip ${filtroApostas === k ? "on" : ""}" data-filtro="${k}">${l}</button>`)
    .join("");
  const bonus = u.history.filter((h) => h.type === "stipend").reverse();
  return `
  <h2 class="section">Minhas apostas</h2>
  <section class="card pad">
    <div class="row"><span>Saldo</span><b>🪙 ${u.balance}</b></div>
    <div class="row"><span>Em aberto</span><b>${abertas.length} · ${openStake} GC</b></div>
    <div class="row"><span>Acertos</span><b>${wins} de ${settled.length}</b></div>
    <div class="row"><span>Apostado (encerradas)</span><b>${staked} GC</b></div>
    <div class="row"><span>Recebido</span><b>${paid} GC</b></div>
    <div class="row"><span>Lucro líquido</span><b class="${net >= 0 ? "pos" : "neg"}">${net >= 0 ? "+" : ""}${net} GC</b></div>
  </section>
  <div class="chips">${chips}</div>
  ${duelosEncerrados()}
  ${filtradas.length ? filtradas.map(betCard).join("") : `<section class="card pad muted">Nenhuma aposta aqui ainda.</section>`}
  <h2 class="section">Bônus semanal</h2>
  <section class="card pad">
    ${bonus.length ? bonus.map((s) => `<div class="row"><span>${s.weekId}</span><b>+${s.amount} GC</b></div>`).join("") : `<span class="muted">Nenhum bônus ainda.</span>`}
  </section>`;
}

function tabela() {
  const rows = state.standings.map((r, i) => `
    <tr class="${i === 5 ? "corte" : ""}">
      <td>${i + 1}</td>
      <td>${r.emote} ${r.team}<div class="muted">${r.name}</div></td>
      <td class="num">${r.w}-${r.l}</td>
      <td class="num">${r.pct}</td>
      <td class="num">${num1(r.pf)}</td>
      <td class="num">${num1(r.pa)}</td>
      <td class="num"><span class="barra"><span style="width:${r.playoff}%"></span></span>${r.playoff}%</td>
    </tr>`).join("");
  return `
  <h2 class="section">Tabela</h2>
  <section class="card" style="overflow-x:auto">
    <table>
      <tr><th>#</th><th>Time</th><th class="num">V-D</th><th class="num">%</th><th class="num">PF</th><th class="num">PA</th><th class="num">Playoff</th></tr>
      ${rows}
    </table>
  </section>
  <p class="muted">A linha tracejada separa os 6 primeiros, que vão ao playoff. A % é uma estimativa por simulação dos jogos restantes.</p>`;
}

function placar() {
  const rows = [...state.players]
    .sort((a, b) => b.balance - a.balance)
    .map((p, i) => `<tr><td>${i + 1}</td><td>${p.emote} ${p.name}<div class="muted">${p.team}</div></td><td class="num">🪙 ${p.balance}</td></tr>`)
    .join("");
  const mine = me();
  const emoteForm = mine
    ? `<section class="card pad"><div class="row"><span>Seu emote</span><input id="emote" class="score" maxlength="4" value="${mine.emote}"><button class="btn" data-emote-save>SALVAR</button></div></section>`
    : "";
  return `
  <h2 class="section">Placar</h2>
  ${emoteForm}
  <section class="card"><table>
    <tr><th>#</th><th>Jogador</th><th class="num">GC</th></tr>${rows}
  </table></section>
  ${placarAjustes()}`;
}

function regras() {
  return `
  <h2 class="section">Regras</h2>
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

function mais() {
  const cur = me();
  const claro = document.documentElement.dataset.theme === "light";
  return `
  <h2 class="section">Mais</h2>
  <section class="card">
    <button class="item" data-tab="regras"><b>Regras</b><span>Como funcionam as apostas</span></button>
    <button class="item" data-tab="estatisticas"><b>Estatísticas</b><span>Apostas, decepções e quem aposta em quem</span></button>
    <button class="item" data-novidades><b>Novidades</b><span>O que mudou no app</span></button>
    <button class="item" data-theme-toggle><b>Modo ${claro ? "escuro" : "claro"}</b><span>Troca a aparência do app</span></button>
    <button class="item" data-tab="admin"><b>Admin</b><span>Confrontos, resultados e controles</span></button>
    ${cur ? `<button class="item neg" data-action="logout"><b>Sair</b><span>${cur.name}</span></button>` : ""}
  </section>`;
}

function reciboView() {
  const r = recibo;
  return `
  <div class="recibo-wrap">
    <div class="recibo">
      <img src="escudo.png" class="carimbo" alt="">
      <div class="rec-title">BILHETE Nº ${String(r.num).padStart(4, "0")}</div>
      <div class="rec-sub">Rodada ${r.week}</div>
      <div class="rec-linha"></div>
      ${r.legs.map((l) => `<div class="rec-item"><span>${l.label}</span><b>${odd(l.odd)}</b></div>`).join("")}
      <div class="rec-linha"></div>
      <div class="rec-item"><span>Apostado</span><b>${r.stake} GC</b></div>
      <div class="rec-item"><span>Odd total</span><b>${odd(r.odd)}</b></div>
      <div class="rec-item grande"><span>Retorno possível</span><b>${r.retorno} GC</b></div>
      <div class="rec-linha"></div>
      <p class="rec-foot">${r.legs.length > 1 ? "Múltipla" : "Aposta simples"} · aposta registrada</p>
      <button class="btn rec-fechar" data-recibo-fechar>FECHAR</button>
    </div>
  </div>`;
}

function novidadesView() {
  const p = NOVIDADES.paginas[modalNov.pagina];
  const total = NOVIDADES.paginas.length;
  const ultima = modalNov.pagina === total - 1;
  return `
  <div class="modal-wrap">
    <div class="modal">
      <div class="modal-topo">${modalNov.pagina + 1}/${total}</div>
      <img src="escudo.png" class="logo-md" alt="">
      <h2>${p.titulo}</h2>
      <ul class="lista-novidades">${p.itens.map((i) => `<li>${i}</li>`).join("")}</ul>
      <div class="modal-nav">
        <button class="pill" data-nov-prev ${modalNov.pagina === 0 ? "disabled" : ""}>Anterior</button>
        ${ultima
          ? `<button class="btn" data-nov-fechar>ENTRAR</button>`
          : `<button class="btn" data-nov-next>Próxima</button>`}
      </div>
    </div>
  </div>`;
}

function duelCard(d) {
  const u = session?.user;
  const pool = d.apostas.filter((x) => x.modo === "pool");
  const poolA = pool.filter((x) => x.side === "A").reduce((s, x) => s + x.valor, 0);
  const poolB = pool.filter((x) => x.side === "B").reduce((s, x) => s + x.valor, 0);
  const linhaBarra = d.modo === "barra"
    ? `<div class="muted">Barra: ${d.teamA} ${d.p}% · ${d.teamB} ${100 - d.p}% · odds ${odd(d.oddA)} / ${odd(d.oddB)}</div>`
    : `<div class="muted">Odd 2,00</div>`;
  const podeApostar = u && !state.frozen && me()?.balance >= 0 &&
    !d.apostas.some((x) => x.user === u) && ![d.desafiante, d.desafiado, d.mediador].includes(u);
  return `
  <section class="card pad ${d.apostas.length ? "ouro-borda" : ""}">
    <div class="row"><b>${d.emoteA} ${d.teamA}</b><span class="muted">x</span><b>${d.teamB} ${d.emoteB}</b></div>
    <div class="muted">${d.nomeA} x ${d.nomeB}${d.nomeM ? ` · mediador ${d.nomeM}` : ""} · ${d.valor} GC cada</div>
    ${linhaBarra}
    <div class="muted">Espectadores: ${poolA} GC em ${d.teamA} · ${poolB} GC em ${d.teamB}</div>
    ${podeApostar ? `<div class="row"><button class="btn btn-ouro" data-espec="${d.id}">APOSTAR COMO ESPECTADOR</button></div>` : ""}
  </section>`;
}

function duelLinha(d, acao) {
  return `
  <section class="card pad">
    <div><b>${d.emoteA} ${d.teamA}</b> x <b>${d.teamB} ${d.emoteB}</b></div>
    <div class="muted">${d.valor} GC · ${d.modo === "barra" ? "com mediador" : "odd 2,00"}</div>
    <div class="row">${acao}</div>
  </section>`;
}

function duelosSecao() {
  const u = session?.user;
  if (!u) return "";
  const recebidos = state.duels.filter((d) =>
    d.status === "pendente" && ((d.desafiado === u && !d.aceites.desafiado) || (d.mediador === u && !d.aceites.mediador)));
  const enviados = state.duels.filter((d) => d.desafiante === u && (d.status === "pendente" || d.status === "ativo"));
  return `
  <h2 class="section">1x1</h2>
  ${!state.frozen ? `<button class="btn" style="width:100%" data-duel-novo>NOVO DESAFIO</button>` : ""}
  ${recebidos.length ? `<h3 class="sub-h">Recebidos</h3>${recebidos.map((d) => duelLinha(d,
      `<button class="btn" data-duel-accept="${d.id}">ACEITAR</button> <button class="pill" data-duel-recusar="${d.id}">RECUSAR</button>`)).join("")}` : ""}
  ${enviados.length ? `<h3 class="sub-h">Enviados</h3>${enviados.map((d) => duelLinha(d,
      d.status === "pendente" ? `<button class="pill" data-duel-cancelar="${d.id}">CANCELAR</button>` : `<span class="muted">Ativo</span>`)).join("")}` : ""}`;
}

function duelosEncerrados() {
  const u = session?.user;
  if (!u) return "";
  const lista = state.duels.filter((d) =>
    d.status !== "pendente" && d.status !== "ativo" &&
    (d.desafiante === u || d.desafiado === u || d.mediador === u || d.apostas.some((x) => x.user === u)));
  if (!lista.length) return "";
  return `<h2 class="section">1x1 encerrados</h2>` + lista.slice().reverse().map((d) => {
    const r = d.resultado;
    const quem = !r ? d.status
      : r.vencedor === "A" ? `Venceu ${d.teamA}`
      : r.vencedor === "B" ? `Venceu ${d.teamB}`
      : "Empate, valores devolvidos";
    return `
    <section class="card pad bet">
      <div class="row"><b>${d.teamA} x ${d.teamB}</b><span class="badge ${d.status === "encerrado" ? "won" : "open"}">${d.status.toUpperCase()}</span></div>
      <div class="muted">${d.valor} GC · ${d.modo === "barra" ? "com mediador" : "odd 2,00"}</div>
      <div>${r ? `${r.a} x ${r.b} · ` : ""}${quem}</div>
    </section>`;
  }).join("");
}

function barraSugerida(pA, pB) {
  const x = (pA - pB) / (38 * Math.SQRT2);
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const dd = 0.3989423 * Math.exp(-x * x / 2);
  const q = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  const cdf = x > 0 ? 1 - q : q;
  return Math.min(80, Math.max(20, Math.round(cdf * 100)));
}

function sheetView() {
  if (sheet.tipo === "novo") {
    const outros = state.players.filter((p) => p.id !== session?.user);
    const eu = me();
    const opcoes = outros.map((p) => `<option value="${p.id}">${p.emote} ${p.name}</option>`).join("");
    const primeiro = outros[0];
    const s = eu && primeiro ? barraSugerida(eu.projection, primeiro.projection) : 50;
    return `
    <div class="modal-wrap"><div class="modal">
      <h2>Novo desafio</h2>
      <div class="row"><span>Adversário</span><select id="dAdv">${opcoes}</select></div>
      <div class="row"><span>Valor (GC)</span><input id="dVal" type="number" min="1" step="1" value="50"></div>
      <div class="row"><span>Modalidade</span><select id="dMod"><option value="odd2">Odd 2,00</option><option value="barra">Com mediador</option></select></div>
      <div id="linhaMed" class="row" style="display:none"><span>Mediador</span><select id="dMed">${opcoes}</select></div>
      <div id="linhaBarra" style="display:none">
        <div class="barra-nomes"><span>${eu?.name ?? "Você"}</span><span id="bNomeB">${primeiro?.name ?? ""}</span></div>
        <div class="barra-visual"><span id="bA" style="width:${s}%"></span><span id="bB" style="width:${100 - s}%"></span></div>
        <input id="dBarra" type="range" min="20" max="80" value="${s}">
        <div class="muted" id="bOdds">Odd ${odd(100 / s)} · Odd ${odd(100 / (100 - s))}</div>
        <details class="info-barra">
          <summary>ⓘ O que é a barra?</summary>
          <p>A barra divide 100% entre os dois lados. Quanto mais ela pende para um lado, menor a odd dele e maior a do outro.
          No meio, as duas odds são 2,00. Com 60% para um lado, ele tem odd 1,67 e o outro, 2,50.
          O mediador paga a diferença: ganha quando o favorito vence e paga quando o azarão vence.
          A barra começa na sugestão da projeção, e você pode mudar. Adversário e mediador precisam aceitar a mesma barra.</p>
        </details>
      </div>
      <p class="muted">Sem mediador, o duelo é odd 2,00 para os dois.</p>
      <div class="modal-nav"><button class="pill" data-sheet-fechar>Cancelar</button><button class="btn" data-duel-enviar>DESAFIAR</button></div>
    </div></div>`;
  }
  const d = state.duels.find((x) => x.id === sheet.duelId);
  if (!d) return "";
  const modos = d.modo === "barra"
    ? `<option value="barra">Com mediador (barra)</option><option value="pool">Pool</option>`
    : `<option value="pool">Pool</option>`;
  return `
  <div class="modal-wrap"><div class="modal ouro">
    <h2>Apostar como espectador</h2>
    <p class="muted">${d.teamA} x ${d.teamB} · ${d.valor} GC por lado</p>
    <div class="row"><span>Lado</span><select id="eLado"><option value="A">${d.teamA}</option><option value="B">${d.teamB}</option></select></div>
    <div class="row"><span>Modo</span><select id="eMod">${modos}</select></div>
    <div class="row"><span>Valor (GC)</span><input id="eVal" type="number" min="10" max="${d.valor}" step="1" value="10"></div>
    <p class="muted">Mínimo 10 GC e máximo ${d.valor} GC. Só uma aposta por duelo. Apostas fecham no congelamento.</p>
    <div class="modal-nav"><button class="pill" data-sheet-fechar>Cancelar</button><button class="btn btn-ouro" data-espec-enviar data-duel="${d.id}">APOSTAR</button></div>
  </div></div>`;
}

// ouro e demais helpers ficam em style.css
const bloqueado2 = bloqueado;

function placarAjustes() {
  if (!state.ajustes || !state.ajustes.length) return "";
  const nome = (id) => state.players.find((p) => p.id === id)?.name ?? id;
  return `<h2 class="section">Ajustes do admin</h2>
  <section class="card">${state.ajustes.map((a) =>
    `<div class="leg"><span>${nome(a.user)}: ${a.delta > 0 ? "+" : ""}${a.delta} GC</span><span class="muted">${a.motivo}</span></div>`).join("")}</section>`;
}

function estatisticas() {
  const d = state.estatisticas[statsEscopo];
  const chips = [["rodada", "Rodada atual"], ["temporada", "Temporada"]]
    .map(([k, l]) => `<button class="chip ${statsEscopo === k ? "on" : ""}" data-stat-escopo="${k}">${l}</button>`)
    .join("");
  const lista = d.jogadores.slice().sort((a, b) => b.favor - a.favor);
  const cards = lista.map((p) => {
    const jog = p.favorW + p.favorL;
    return `
    <section class="card pad">
      <div class="row"><b>${p.emote} ${p.name}</b><span class="muted">${p.team}</span></div>
      <div class="row"><span>A favor</span><b>${p.favor} GC</b></div>
      <div class="row"><span>Contra</span><b>${p.contra} GC</b></div>
      <div class="row"><span>Decepção (perdido a favor)</span><b class="neg">${p.decepcao} GC</b></div>
      <div class="row"><span>Taxa de acerto (simples)</span><b>${jog ? Math.round((100 * p.favorW) / jog) + "%" : "—"}</b></div>
    </section>`;
  }).join("");
  const cab = `<tr><th>De \u2193 / Para \u2192</th>${lista.map((p) => `<th class="num">${p.emote}</th>`).join("")}</tr>`;
  const linhas = state.players.map((u) => {
    const linha = d.matriz[u.id] ?? {};
    return `<tr><td>${u.emote}</td>${lista.map((p) => `<td class="num">${linha[p.id] ? linha[p.id] : ""}</td>`).join("")}</tr>`;
  }).join("");
  return `
  <h2 class="section">Estatísticas</h2>
  <div class="chips">${chips}</div>
  <p class="muted">Múltiplas contam o valor em cada seleção. A taxa de acerto considera só apostas simples.</p>
  ${cards}
  <h2 class="section">Quem aposta em quem</h2>
  <section class="card" style="overflow-x:auto"><table class="tabela-matriz">${cab}${linhas}</table></section>
  <p class="muted">Linhas: quem apostou. Colunas: em quem. Valores em GC, a favor do jogador da coluna. Os emotes identificam cada jogador nos cards acima.</p>`;
}

function splashView() {
  return `<div class="splash"><img src="escudo.png" alt=""><p>TOP CARAIO FC</p></div>`;
}
