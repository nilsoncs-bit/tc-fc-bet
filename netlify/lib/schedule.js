import { slug } from "./utils.js";

// Lê o texto colado pelo admin: 2 linhas por confronto ("Nome | Time | Projeção"), blocos separados por linha em branco
export function parseSchedule(text, week, registry) {
  const blocks = text
    .trim()
    .split(/\n\s*\n/)
    .map((b) => b.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((b) => b.length);
  if (!blocks.length) throw new Error("Cole os confrontos antes de salvar");
  const players = [];
  const fixtures = [];
  blocks.forEach((block, i) => {
    if (block.length !== 2) throw new Error(`Confronto ${i + 1}: cada confronto precisa de 2 linhas`);
    const ids = block.map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      if (parts.length !== 3 || !parts[0] || !parts[1]) throw new Error(`Linha inválida: "${line}"`);
      const projection = Number(parts[2].replace(",", "."));
      if (!Number.isFinite(projection)) throw new Error(`Projeção inválida: "${line}"`);
      const known = Object.values(registry).find((r) => r.name.toLowerCase() === parts[0].toLowerCase());
      const id = known?.id ?? slug(parts[0]);
      if (!players.some((p) => p.id === id)) players.push({ id, name: parts[0], team: parts[1], projection });
      return id;
    });
    fixtures.push({ id: `f${i + 1}`, a: ids[0], b: ids[1] });
  });
  return { week, players, fixtures };
}
