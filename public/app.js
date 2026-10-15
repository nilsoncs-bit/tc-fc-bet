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
const me = () => state?.players.find((p) => p.id === session?.user);

async function load() {
  if (state && (document.hidden || tab === "admin")) return;
  state = await (await fetch(API)).json();
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
  slip = null;
  render();
}

function header() {
  const cur = me();
  const tabs = [["mercados", "Mercados"], ["tabela", "Tabela"], ["placar", "Placar"], ["regras", "Regras"], ["admin", "Admin"]];
  return `
  <header class="top">
    <div class="brand"><span class="slash">/</span> TOP CARAIO <span class="accent">FC</span></div>
    ${cur ? `
