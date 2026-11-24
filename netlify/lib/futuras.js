import { mulberry32 } from "../functions/engine.js";
import { PLAYOFF_SPOTS, TOTAL_SEASON_WEEKS } from "../functions/data.js";

// Mercados de longo prazo (aba Futuras)
export const FUT = ["fc", "fps", "fpn", "fl"];
export const NOME_FUT = { fc: "Campeão", fps: "Playoff: sim", fpn: "Playoff: não", fl: "Lanterna" };
const SIMS = 20000;

// Probabilidades pela força da temporada (pontos ÷ jogos), recorde atual e confrontos restantes.
// rows: tabela atual [{id, w, l, pf}]; semanas: lista de semanas restantes, cada uma uma lista de pares [a, b] ou null (sorteio)
// Mata-mata: 6 times, 1º e 2º de bye. W15: 3×6 e 4×5. W16: 1 × vencedor 4/5 e 2 × vencedor 3/6. W17: final.
export function calcFuturas(rows, semanas, sigma) {
  const n = rows.length;
  const ids = rows.map((r) => r.id);
  const idx = Object.fromEntries(ids.map((id, i) => [id, i]));
  const media = rows.map((r) => (r.w + r.l ? r.pf / (r.w + r.l) : 120));
  const rng = mulberry32(20261124);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const pontos = (i) => media[i] + sigma * gauss();
  const campeao = new Array(n).fill(0);
  const playoff = new Array(n).fill(0);
  const lanterna = new Array(n).fill(0);
  const w = new Array(n);
  const pf = new Array(n);
  for (let s = 0; s < SIMS; s++) {
    for (let i = 0; i < n; i++) { w[i] = rows[i].w; pf[i] = rows[i].pf; }
    for (const semana of semanas) {
      let pares = semana;
      if (!pares) {
        // semana sem confrontos conhecidos: sorteia
        const ord = ids.map((_, i) => i);
        for (let i = ord.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [ord[i], ord[j]] = [ord[j], ord[i]]; }
        pares = [];
        for (let i = 0; i + 1 < ord.length; i += 2) pares.push([ids[ord[i]], ids[ord[i + 1]]]);
      }
      for (const [a, b] of pares) {
        const ia = idx[a];
        const ib = idx[b];
        if (ia === undefined || ib === undefined) continue;
        const pa = pontos(ia);
        const pb = pontos(ib);
        pf[ia] += pa; pf[ib] += pb;
        if (pa > pb) w[ia]++; else w[ib]++;
      }
    }
    const ord = ids.map((_, i) => i).sort((x, y) => w[y] - w[x] || pf[y] - pf[x]);
    for (let k = 0; k < PLAYOFF_SPOTS; k++) playoff[ord[k]]++;
    lanterna[ord[n - 1]]++;
    const jogo = (a, b) => (pontos(a) > pontos(b) ? a : b);
    const s1 = ord[0], s2 = ord[1], s3 = ord[2], s4 = ord[3], s5 = ord[4], s6 = ord[5];
    const v36 = jogo(s3, s6);
    const v45 = jogo(s4, s5);
    campeao[jogo(jogo(s1, v45), jogo(s2, v36))]++;
  }
  const out = {};
  ids.forEach((id, i) => {
    out[id] = { fc: campeao[i] / SIMS, fps: playoff[i] / SIMS, fpn: 1 - playoff[i] / SIMS, fl: lanterna[i] / SIMS };
  });
  return out;
}

// Odd com margem e teto. Mercado decidido (garantido ou eliminado) não é oferecido: null
export function oddFutura(p, margem, teto) {
  if (!(p > 0.0005) || p >= 0.9995) return null;
  return Math.min(teto, Math.max(1.01, +(1 / (p * (1 + margem))).toFixed(2)));
}

export const temporadaRegularCompleta = (rows) => rows.length > 0 && rows.every((r) => r.w + r.l >= TOTAL_SEASON_WEEKS);
