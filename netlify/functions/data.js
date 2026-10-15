// Padrões do jogo. A cada semana você pode substituir os confrontos pelo admin (aba Admin).
// name = nome do jogador (login) | team = time (exibido nos mercados) | projection = projeção semanal

export const PLAYERS = [
  { id: "uendel", name: "Uendel Rodrigues", team: "Rodrigues", projection: 115.6 },
  { id: "nilson", name: "Nilson Filho", team: "Ananindeua Coitados", projection: 162.1 },
  { id: "julio", name: "Júlio Cezar", team: "Chicab6lls", projection: 121 },
  { id: "reginaldo", name: "Reginaldo Santos", team: "CPU Team I", projection: 123.7 },
  { id: "heitor", name: "Heitor Félix", team: "Chuta a bola no Y", projection: 141.1 },
  { id: "odireston", name: "Odireston Iglesias", team: "CA Bandeirante", projection: 111.3 },
  { id: "marcos", name: "Marcos Morais", team: "Taylor Swift e Louro José", projection: 133.6 },
  { id: "leonardo", name: "Leonardo Porto", team: "botafogunner", projection: 127.7 },
  { id: "andre", name: "André Cussat", team: "Leblon Seahawks", projection: 122 },
  { id: "matheus", name: "Matheus Pagotto", team: "Brahma Quente a R$15", projection: 128.4 },
  { id: "lucca", name: "Lucca Ferranti", team: "Luccanneers", projection: 145.9 },
  { id: "bernardo", name: "Bernardo Félix", team: "Eagles Caxias", projection: 128.8 },
  { id: "gustavo", name: "Gustavo Oliveira", team: "Barbearia Swing", projection: 139.8 },
  { id: "victor", name: "Victor Hugo", team: "Is Tupro FC", projection: 141.2 },
];

export const FIXTURES = [
  { id: "f1", a: "uendel", b: "nilson" },
  { id: "f2", a: "julio", b: "reginaldo" },
  { id: "f3", a: "heitor", b: "odireston" },
  { id: "f4", a: "marcos", b: "leonardo" },
  { id: "f5", a: "andre", b: "matheus" },
  { id: "f6", a: "lucca", b: "bernardo" },
  { id: "f7", a: "gustavo", b: "victor" },
];

// Histórico da liga antes do app (classificação da ESPN): w, l, pf, pa
export const SEED = {
  uendel: { w: 2, l: 3, pf: 611.2, pa: 665.6 },
  nilson: { w: 4, l: 1, pf: 774.1, pa: 701.6 },
  julio: { w: 4, l: 1, pf: 716.1, pa: 642.5 },
  reginaldo: { w: 1, l: 4, pf: 597.3, pa: 724.4 },
  heitor: { w: 2, l: 3, pf: 667.4, pa: 583.7 },
  odireston: { w: 1, l: 4, pf: 531.5, pa: 684.8 },
  marcos: { w: 3, l: 2, pf: 751.1, pa: 698.0 },
  leonardo: { w: 1, l: 4, pf: 609.0, pa: 719.9 },
  andre: { w: 3, l: 2, pf: 621.8, pa: 617.4 },
  matheus: { w: 1, l: 4, pf: 588.3, pa: 664.1 },
  lucca: { w: 3, l: 2, pf: 647.0, pa: 625.5 },
  bernardo: { w: 2, l: 3, pf: 555.8, pa: 626.3 },
  gustavo: { w: 4, l: 1, pf: 724.6, pa: 615.8 },
  victor: { w: 4, l: 1, pf: 833.3, pa: 658.9 },
};

export const PLAYOFF_SPOTS = 6;
export const TOTAL_SEASON_WEEKS = 10; // ajuste para o número real de semanas da temporada regular
