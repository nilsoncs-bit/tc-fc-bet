const API = "/.netlify/functions/game";
let state = null;
let session = JSON.parse(localStorage.getItem("tcfc-session") || "null");
let tab = "mercados";
let slip = [];
let stake = 10;
let adminPw = "";
let loginMsg = "";
let filtroApostas = "todas";
let recibo = null;
let modalNov = null;
let sheet = null;
let statsEscopo = "rodada";
let splash = true;
let primeiraCarga = true;

const $ = (s) => document.querySelector(s);
const odd = (n) => n.toFixed(2).replace(".", ",");
const num1 = (n) => n.toFixed(1).replace(".", ",");
const fx = (id) => state.fixtures.find((f) => f.id === id);
const isSel = (id, market, side, team) =>
  slip.some(
    (l) => l.fixtureId === id && l.market === market && l.side === side && (l.team ?? null) === (team ?? null)
  ) ? "sel" : "";
const me = () => state?.players.find((p) => p.id === session?.user);

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  localStorage.setItem("tcfc-tema", t);
}

function initTheme() {
  const salvo = localStorage.getItem("tcfc-tema");
  const claro = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
  document.documentElement.dataset.theme = salvo || (claro ? "light" : "dark");
}

async function load() {
  if (state && (document.hidden || tab === "admin")) return;
  state = await (await fetch(API)).json();
  if (primeiraCarga) {
    primeiraCarga = false;
    if (localStorage.getItem("tcfc-novidades-visto") !== NOVIDADES.versao) modalNov = { pagina: 0 };
  }
  render();
}

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
  slip = [];
  render();
}

function header() {
  const cur = me();
  return `
  <header class="top">
    <div class="brand"><img src="escudo.png" alt="" class="logo-sm">TOP CARAIO FC</div>
    ${cur ? `<div class="userbox">${cur.emote} ${cur.name}<b>🪙 ${cur.balance}</b></div>` : ""}
  </header>`;
}

const TABS = [
  ["mercados", "🏟️", "Mercados"],
  ["apostas", "📜", "Apostas"],
  ["tabela", "🏛️", "Tabela"],
  ["placar", "🛡️", "Placar"],
  ["mais", "☰", "Mais"],
];

function tabbar() {
  const ativa = (k) => tab === k || (k === "mais" && (tab === "regras" || tab === "admin" || tab === "estatisticas"));
  return `
  <nav class="tabbar">
    ${TABS.map(([k, i, l]) => `<button class="tab ${ativa(k) ? "on" : ""}" data-tab="${k}"><span>${i}</span><small>${l}</small></button>`).join("")}
  </nav>`;
}

function render() {
  if (!state) {
    if (splash) $("#app").innerHTML = splashView();
    return;
  }
  let body;
  if (tab === "admin") body = admin();
  else if (tab === "tabela") body = tabela();
  else if (tab === "mais") body = mais();
  else if (tab === "regras") body = regras();
  else if (!session && (tab === "mercados" || tab === "apostas")) body = loginView();
  else body = { mercados, apostas, placar, estatisticas }[tab]();
  $("#app").innerHTML =
    header() +
    `<main>${body}</main>` +
    (session && tab === "mercados" && slip.length ? slipView() : "") +
    tabbar() +
    (recibo ? reciboView() : "") +
    (modalNov ? novidadesView() : "") +
    (sheet ? sheetView() : "") +
    (splash ? splashView() : "");
}

let toqueX = null;
document.addEventListener("touchstart", (e) => { toqueX = e.touches[0].clientX; }, { passive: true });
document.addEventListener("touchend", (e) => {
  if (!modalNov || toqueX === null) return;
  const dx = e.changedTouches[0].clientX - toqueX;
  toqueX = null;
  const total = NOVIDADES.paginas.length;
  if (dx < -50 && modalNov.pagina < total - 1) { modalNov.pagina++; render(); }
  if (dx > 50 && modalNov.pagina > 0) { modalNov.pagina--; render(); }
});
