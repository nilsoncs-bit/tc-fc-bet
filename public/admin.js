// Blocos abertos no Admin (para não fecharem quando a tela redesenha)
const adminAbertos = new Set(["rodada"]);
const bloco = (id, titulo, conteudo) => `
  <details class="card bloco" data-bloco="${id}" ${adminAbertos.has(id) ? "open" : ""}>
    <summary>${titulo}</summary>
    <div class="dentro">${conteudo}</div>
  </details>`;

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
  const comPlacar = state.fixtures.filter((f) => f.result).length;
  const abertas = state.players.reduce((n, p) => n + p.history.filter((h) => (h.type === "bet" || h.type === "multi") && h.status === "open" && h.week === state.week).length, 0);
  const fila = state.fila.length ? state.fila.map((x) => `W${x.nfl}`).join(", ") : "nenhuma";
  return `
  <h2 class="section">Admin</h2>

  <section class="card pad">
    <div class="row"><span class="semana-grande">${state.semana}</span></div>
    <p class="muted">${comPlacar} de ${state.fixtures.length} jogos com placar · ${abertas} aposta(s) em aberto · Na fila: ${fila}</p>
    <button class="btn btn-largo" data-avancar>FECHAR SEMANA E AVANÇAR</button>
    <p class="muted">A semana só vira aqui. Ao avançar: bônus de 100 para quem apostou nesta semana, odds e congelamentos zerados, e entram os confrontos da fila.</p>
  </section>

  ${bloco("rodada", "Rodada: congelar e fechar", rodadaCtl())}

  ${bloco("resultados", "Resultados", `
    <p class="muted">Cole os placares, um por linha, na ordem dos jogos (ex.: 146.7 94.6).</p>
    <textarea id="placaresTexto" placeholder="146.7 94.6"></textarea>
    <button class="btn btn-largo" data-aplicar-placares>APLICAR PLACARES</button>
    <button class="pill btn-largo" data-copiar-placares>COPIAR PLACARES DA RODADA</button>
    <p class="muted">Ou digite jogo a jogo:</p>
    ${state.fixtures.map((f) => `
      <div class="row">
        <span>${f.a} x ${f.b}</span>
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="a" value="${f.result?.a ?? ""}">
        <input class="score" type="number" min="0" data-fid="${f.id}" data-side="b" value="${f.result?.b ?? ""}">
      </div>`).join("")}
    <button class="btn btn-largo" data-save>SALVAR E LIQUIDAR</button>
    <p class="muted">Se a rodada já tinha placar, corrige e refaz os pagamentos.</p>`)}

  ${bloco("confrontos", "Confrontos e fila", `
    <button class="pill btn-largo" data-copiar-confrontos>COPIAR CONFRONTOS DA RODADA</button>
    <br><br>
    <div class="row"><select id="target">
      <option value="fila">Próximas semanas (fila)</option>
      <option value="current">Esta semana (${state.semana})</option>
    </select></div>
    <textarea id="sched" placeholder="W12
Nome | Time | Projeção
Nome | Time | Projeção

Nome | Time | Projeção
Nome | Time | Projeção

W13
Nome | Time | Projeção
..."></textarea>
    <p class="muted">Cada confronto são 2 linhas, separados por uma linha em branco. Na fila, comece cada semana com uma linha "W12", "W13"... e cole quantas quiser de uma vez. Sem essa linha, vale a próxima semana. Subir de novo uma semana substitui a anterior.</p>
    <button class="btn btn-largo" data-schedule>SALVAR CONFRONTOS</button>
    ${state.fila.length ? `<br><br><b>Na fila</b>${state.fila.map((x) => `
      <div class="row"><span>W${x.nfl} · ${x.jogos} jogos</span><button class="pill" data-fila-remover="${x.nfl}">REMOVER</button></div>`).join("")}` : ""}`)}

  ${bloco("odds", "Odds e margens", configSecao() + oddsSecao())}

  ${bloco("futuras", "Futuras", futurasAdmin())}

  ${bloco("duelos", "1x1 em aberto", duelosAbertos())}

  ${bloco("jogadores", "Jogadores e saldos", `
    <b>Ajuste de saldo</b>
    <p class="muted">Aparece para todos, com o motivo.</p>
    <div class="row"><select id="ajUser">${opcoesJogadores}</select></div>
    <div class="row"><input id="ajVal" type="number" step="1" placeholder="+50 ou -30"></div>
    <div class="row"><input class="pw" id="ajMotivo" placeholder="Motivo curto"></div>
    <button class="btn btn-largo" data-ajuste>APLICAR AJUSTE</button>
    <br><br><b>Apostas em aberto</b>
    <p class="muted">Cancelar devolve o valor apostado.</p>
    ${apostasAbertas()}
    <br><b>Resetar PIN</b>
    <div class="row"><select id="resetSel">${opcoesJogadores}</select></div>
    <button class="btn btn-largo" data-reset-pin>RESETAR PIN</button>`)}

  ${bloco("tabela", "Ajuste da tabela", ajusteTabelaSecao())}

  ${bloco("ferramentas", "Outras ferramentas", `
    <b>Número da semana da NFL</b>
    <p class="muted">Só muda o nome mostrado no app.</p>
    <div class="row"><input id="nflSemana" type="number" min="1" max="30" value="${state.nfl.atual}"><input id="nflTemporada" type="number" value="${state.nfl.temporada}"></div>
    <button class="btn btn-largo" data-semana-nfl>SALVAR NOME DA SEMANA</button>
    <br><br><b>Reabrir confrontos da rodada</b>
    <p class="muted">Apaga os placares desta semana (só se nenhuma aposta foi liquidada).</p>
    <button class="btn btn-largo" data-reopen>REABRIR CONFRONTOS</button>
    <br><br><b>Liquidar rodada anterior</b>
    <div class="row"><input class="pw" id="prevWeek" placeholder="Ex.: W9"></div>
    <textarea id="prevText" placeholder="Confrontos da rodada, no mesmo formato de Confrontos"></textarea>
    <textarea id="prevScores" placeholder="Um placar por linha, na mesma ordem:
118.5 96.4"></textarea>
    <button class="btn btn-largo" data-settle-prev>LIQUIDAR RODADA ANTERIOR</button>`)}

  ${bloco("auditoria", "Auditoria", auditoriaSecao())}`;
}

// Congelar a rodada inteira, cada jogo, e fechar handicap/total de cada jogo
function rodadaCtl() {
  const congelados = state.congelados || [];
  const extras = state.extras || [];
  const jogos = state.fixtures.map((f) => {
    const vit = congelados.includes(f.id);
    const ext = extras.includes(f.id);
    return `
      <div class="jogo-ctl">
        <span>${f.aEmote} ${f.a} x ${f.bEmote} ${f.b}${f.result ? ' <span class="muted">· encerrado</span>' : ""}</span>
        <button class="tog ${vit ? "off" : "on"}" data-congelar="${f.id}" data-valor="${vit ? "0" : "1"}">${vit ? "❄ JOGO" : "JOGO ✓"}</button>
        <button class="tog ${ext || vit ? "off" : "on"}" data-extras-jogo="${f.id}" data-valor="${ext ? "0" : "1"}">${ext || vit ? "❄ HC/TOT" : "HC/TOT ✓"}</button>
      </div>`;
  }).join("");
  return `
    <button class="btn btn-largo" data-freeze>${state.frozen ? "LIBERAR TODOS OS JOGOS" : "CONGELAR TODOS OS JOGOS"}</button>
    <br><br>
    <button class="btn btn-largo" data-fechar-rodada>${state.rodadaFechada && !state.frozen ? "REABRIR MELHOR E ODIRESTON" : state.frozen ? "MELHOR E ODIRESTON: FECHADOS (TUDO CONGELADO)" : "FECHAR MELHOR E ODIRESTON"}</button>
    <p class="muted">JOGO congela o jogo inteiro. HC/TOT fecha só handicap e total, e o vencedor continua aberto.</p>
    ${jogos}`;
}

// Margens em %, desvios em pontos. Campo vazio volta para o padrão.
function configSecao() {
  const c = state.config;
  const pc = (x) => String(+(x * 100).toFixed(2)).replace(".", ",");
  const campo = (id, rotulo, valor) => `<span>${rotulo}</span><input data-cfg="${id}" inputmode="decimal" value="${valor}">`;
  return `
    <b>Configuração</b>
    <div class="cfg">
      ${campo("margemVitoria", "Margem vencedor (%)", pc(c.margemVitoria))}
      ${campo("margemHandicap", "Margem handicap (%)", pc(c.margemHandicap))}
      ${campo("margemTotal", "Margem total (%)", pc(c.margemTotal))}
      ${campo("pOver", "Chance do \"mais de\" no total (%)", pc(c.pOver))}
      ${campo("margemRodada", "Margem melhor/Odireston (%)", pc(c.margemRodada))}
      ${campo("tetoRodada", "Odd máxima melhor/Odireston", String(c.tetoRodada).replace(".", ","))}
      ${campo("sigmaDif", "Desvio da diferença do jogo", String(c.sigmaDif).replace(".", ","))}
      ${campo("sigmaTime", "Desvio por time", String(c.sigmaTime).replace(".", ","))}
      ${campo("margemFuturas", "Margem Futuras (%)", pc(c.margemFuturas))}
      ${campo("tetoFuturas", "Odd máxima Futuras", String(c.tetoFuturas).replace(".", ","))}
    </div>
    <p class="muted">O desvio da diferença define a chance de vitória e as odds do handicap. O desvio por time define melhor/Odireston e as chances da tabela. Campo vazio volta para o padrão.</p>
    <button class="btn btn-largo" data-config-save>SALVAR CONFIGURAÇÃO</button>
    <br><br>`;
}

// Mesma conta do servidor, só para mostrar a odd enquanto a barra é movida
function oddsPrevia(pInt) {
  const p = pInt / 100;
  const m = state.config.margemVitoria;
  const oddDe = (q) => Math.min(50, Math.max(1.05, +(1 / (Math.min(0.99, Math.max(0.01, q)) * (1 + m))).toFixed(2)));
  return { oddA: oddDe(p), oddB: oddDe(1 - p) };
}

function oddsSecao() {
  const val = (manual, v) => (manual ? String(v).replace(".", ",") : "");
  const jogos = state.fixtures.map((f) => {
    const p = f.pA;
    const o = oddsPrevia(p);
    const ta = f.totais.a;
    const tb = f.totais.b;
    return `
      <div class="odd-bloco">
        <div class="row"><b>${f.aEmote} ${f.a} x ${f.bEmote} ${f.b}</b></div>
        <div class="barra-nomes"><span>${f.a}</span><span>${f.b}</span></div>
        <input type="range" min="2" max="98" value="${p}" data-odd="${f.id}">
        <div class="muted" data-odd-txt="${f.id}">${p}% · odd ${odd(o.oddA)} · ${100 - p}% · odd ${odd(o.oddB)}</div>
        <div class="row">
          <span class="muted">Vencedor: ${f.pManual ? `<b>manual</b> (projeção ${f.pAuto}%)` : "pela projeção"}</span>
          ${f.pManual ? `<button class="pill" data-barra-projecao="${f.id}">VOLTAR À PROJEÇÃO</button>` : ""}
        </div>
        <div class="row"><span class="muted">Handicap de ${f.a}</span>
          <input class="score" data-hc="${f.id}" inputmode="decimal" placeholder="${sinal(f.handicap.auto)}" value="${val(f.handicap.manual, f.handicap.linha)}"></div>
        <div class="row"><span class="muted">Total ${f.a}</span>
          <input class="score" data-tot="${f.aId}" inputmode="decimal" placeholder="${num1(ta.auto)}" value="${val(ta.manual, ta.linha)}"></div>
        <div class="row"><span class="muted">Total ${f.b}</span>
          <input class="score" data-tot="${f.bId}" inputmode="decimal" placeholder="${num1(tb.auto)}" value="${val(tb.manual, tb.linha)}"></div>
      </div>`;
  }).join("");
  const rodada = state.rodada.times.slice().sort((x, y) => x.oddMelhor - y.oddMelhor).map((r) => {
    const p = state.players.find((x) => x.id === r.id);
    return `
      <div class="row"><span>${p.emote} ${p.team}</span>
        <input class="score" data-mb="${r.id}" inputmode="decimal" placeholder="${odd(r.autoMelhor)}" value="${val(r.manualMelhor, r.oddMelhor)}">
        <input class="score" data-mp="${r.id}" inputmode="decimal" placeholder="${odd(r.autoPior)}" value="${val(r.manualPior, r.oddPior)}">
      </div>`;
  }).join("");
  return `
    <b>Ajustes manuais da semana</b>
    <p class="muted">Tudo começa pela projeção. Mexer na barra, ou preencher um campo, vira ajuste manual só daquele mercado. Campo vazio volta para a projeção. Apostas já feitas não mudam.</p>
    ${jogos}
    <div class="odd-bloco">
      <div class="row"><b>Melhor / Odireston da rodada</b></div>
      <div class="row rodada-cab"><span></span><b class="score">Melhor</b><b class="score">Odireston</b></div>
      ${rodada}
    </div>
    <button class="btn btn-largo" data-odds-save>SALVAR ODDS</button>`;
}

// Futuras: suspender mercado, odd manual por time, recalcular e definir o campeão
function futurasAdmin() {
  const F = state.futuras;
  const val = (t) => (t.manual ? String(t.odd).replace(".", ",") : "");
  const mercado = (m) => {
    const M = F.mercados[m];
    const susp = !!F.suspensos[m];
    return `
      <div class="odd-bloco">
        <div class="row"><b>${M.nome}</b>
          <button class="tog ${susp ? "off" : "on"}" data-fut-suspender="${m}" data-valor="${susp ? "0" : "1"}">${susp ? "❄ SUSPENSO" : "ABERTO ✓"}</button></div>
        ${M.times.map((t) => {
          const p = state.players.find((x) => x.id === t.id);
          return `<div class="row"><span>${p.emote} ${p.team} <span class="muted">${(t.p * 100).toFixed(1).replace(".", ",")}%</span></span>
            <input class="score" data-fut="${m}" data-fut-id="${t.id}" inputmode="decimal" placeholder="${t.auto ? odd(t.auto) : "—"}" value="${val(t)}"></div>`;
        }).join("")}
      </div>`;
  };
  const opcoes = state.players.map((p) => `<option value="${p.id}" ${F.campeao === p.id ? "selected" : ""}>${p.emote} ${p.team}</option>`).join("");
  return `
    <p class="muted">As odds são recalculadas a cada FECHAR SEMANA. Campo preenchido vira odd manual, vazio volta para a calculada.</p>
    ${["fc", "fps", "fpn", "fl"].map(mercado).join("")}
    <button class="btn btn-largo" data-fut-salvar>SALVAR ODDS DAS FUTURAS</button>
    <br><br><button class="pill btn-largo" data-fut-recalcular>RECALCULAR AGORA</button>
    <br><br><b>Campeão</b>
    <p class="muted">Ao definir, as apostas de campeão são pagas.</p>
    <div class="row"><select id="futCampeao"><option value="">— nenhum —</option>${opcoes}</select></div>
    <button class="btn btn-largo" data-fut-campeao>DEFINIR CAMPEÃO</button>`;
}

// 1x1 pendentes ou ativos: cancelar devolve o dinheiro de todos os envolvidos
function duelosAbertos() {
  const abertos = state.duels.filter((d) => d.status === "pendente" || d.status === "ativo");
  if (!abertos.length) return '<p class="muted">Nenhum 1x1 em aberto.</p>';
  return abertos.map((d) => `
    <div class="row"><span>${d.emoteA} ${d.nomeA} x ${d.emoteB} ${d.nomeB}<div class="muted">${rotulo(d.week)} · ${d.valor} GC · ${d.status}${d.apostas.length ? ` · ${d.apostas.length} espectador(es)` : ""}</div></span>
      <button class="pill" data-duel-admin-cancelar="${d.id}">CANCELAR E DEVOLVER</button></div>`).join("") +
    (abertos.length > 1 ? '<br><button class="btn btn-largo" data-duel-admin-cancelar="todos">CANCELAR TODOS</button>' : "");
}

// Texto no mesmo formato que se cola em Confrontos
function textoConfrontos() {
  const linha = (id) => {
    const p = state.players.find((x) => x.id === id);
    return `${p.name} | ${p.team} | ${String(p.projection).replace(".", ",")}`;
  };
  return state.fixtures.map((f) => `${linha(f.aId)}\n${linha(f.bId)}`).join("\n\n");
}

// Um placar por linha, na ordem dos jogos; jogo sem placar fica com a linha vazia
const textoPlacares = () => state.fixtures.map((f) => (f.result ? `${f.result.a} ${f.result.b}` : "")).join("\n");

async function copiarTexto(txt) {
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    const t = document.createElement("textarea");
    t.value = txt;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
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


function auditoriaSecao() {
  const a = state.auditoria;
  const faltando = a.faltando.length
    ? a.faltando.map((f) => `<div class="leg"><span>${f}</span></div>`).join("")
    : `<p class="muted">Todos os jogos da semana atual têm placar.</p>`;
  const abertas = a.abertasAntigas.length
    ? a.abertasAntigas.map((x) => `<div class="leg"><span>${x.nome}</span><span class="muted">${x.n} aposta(s) de ${rotulo(x.week)}</span></div>`).join("")
    : `<p class="muted">Nenhuma aposta aberta de semanas anteriores.</p>`;
  const semanas = a.semanas.length
    ? a.semanas.map((s) => `
        <div class="row"><b>${rotulo(s.week)}</b></div>
        ${s.jogos.map((j) => `<div class="leg"><span>${j.a} ${j.pa} x ${j.pb} ${j.b}</span><span class="muted">venceu ${j.vencedor}</span></div>`).join("")}`).join("")
    : `<p class="muted">Nenhuma semana lançada.</p>`;
  return `
    <p class="muted">Confira os placares de cada semana.</p>
    <b>Faltando na semana atual</b>
    ${faltando}
    <br><b>Apostas abertas de semanas anteriores</b>
    ${abertas}
    <br><b>Semanas lançadas</b>
    ${semanas}`;
}

function ajusteTabelaSecao() {
  const opcoes = state.players.map((p) => `<option value="${p.id}">${p.emote} ${p.name}</option>`).join("");
  const ajustados = Object.entries(state.ajusteTabela || {}).map(([id, aj]) => {
    const nome = state.players.find((p) => p.id === id)?.name ?? id;
    return `<div class="leg"><span>${nome}</span><span class="muted">V ${aj.w} · D ${aj.l} · PF ${aj.pf} · PA ${aj.pa}</span></div>`;
  }).join("");
  return `
    <p class="muted">Soma V, D, PF e PA por cima do histórico. Não mexe em apostas nem em saldos. Aparece como "ajustado" para todos. Para zerar, aplique tudo em 0.</p>
    <div class="row"><select id="atTime">${opcoes}</select></div>
    <div class="row"><input id="atW" type="number" placeholder="V (+ ou -)"><input id="atL" type="number" placeholder="D (+ ou -)"></div>
    <div class="row"><input id="atPF" type="number" step="0.1" placeholder="PF (+ ou -)"><input id="atPA" type="number" step="0.1" placeholder="PA (+ ou -)"></div>
    <button class="btn" data-ajuste-tabela>APLICAR AJUSTE</button>
    ${ajustados ? `<br><br><b>Ajustes ativos</b>${ajustados}` : ""}`;
}
