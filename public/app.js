const API = "/.netlify/functions/game";
let state = null;
let session = JSON.parse(localStorage.getItem("tcfc-session") || "null");
let tab = "mercados";
let slip = null;
let adminPw = "";
let loginMsg = "";

const $ = (s) => document.querySelector(s);
const odd = (n) => n.toFixed(2).replace(".", ",");
const num1 = (n) => n.toFixed(1).replace(".", ",");
const fx = (id) => state.fixtures.find((f) => f.id === id);
const isSel = (id, side) => (slip && slip.fixtureId === id && slip.side === side ? "sel" : "");

async function load() {
  // Não recarrega ao voltar o foco se o admin estiver digitando
  if (state && (document.hidden || tab === "admin")) return;
  state = await (await fetch(API)).json();
  render();
}

// Ações de jogador levam nome e PIN automaticamente; ações de admin usam a senha
async function post(body, auth = true) {
  const payload = auth ? { ...body, user: session?.user, pin: session?.pin } : body;
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json();
  if (!r.ok) {
    if (r.status === 401 && auth) logout();
    throw new Error(data.error || "Erro");
  }
  return data;
}

async function login(user, pin) {
  const data = await post({ action: "login", user, pin }, false);
  session = { user, pin };
  localStorage.setItem("tcfc-session", JSON.stringify(session));
  loginMsg = data.created ? "PIN criado! Guarde-o para os próximos acessos." : "";
  state = data;
  tab = "mercados";
  render();
}

function logout() {
  session = null;
  localStorage.removeItem("tcfc-session");
  slip = null;
  render();
}

const me = () => state?.players.find((p) => p.id === session?.user);

function header() {
  const cur = me();
  const tabs = [["mercados", "Mercados"], ["tabela", "Tabela"], ["placar", "Placar"], ["regras", "Regras"], ["admin", "Admin"]];
  return `
  <header class="top">
    <div class="brand"><span class="slash">/</span> TOP CARAIO <span class="accent">FC</span></div>
    ${cur ? `<div class="userbox">${cur.name}<b>${cur.balance} GC</b></div>` : ""}
    <nav>
      ${tabs.map(([k, l]) => `<button class="pill ${tab === k ? "on" : ""}" data-tab="${k}">${l.toUpperCase()}</button>`).join("")}
      ${session ? `<button class="pill" data-action="logout">SAIR</button>` : ""}function mercados() {
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
