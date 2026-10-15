import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

// Login por nome + PIN. Com create=true, cria o PIN no primeiro acesso.
export function authPlayer(state, user, pin, { create = false } = {}) {
  if (!state.registry[user]) return { error: "Jogador inválido" };
  if (typeof pin !== "string" || !/^\d{4,6}$/.test(pin)) return { error: "O PIN deve ter de 4 a 6 números" };
  const rec = state.auth[user];
  if (!rec) {
    if (!create) return { error: "Faça o primeiro acesso para criar seu PIN" };
    const salt = randomBytes(16).toString("hex");
    state.auth[user] = { salt, hash: scryptSync(pin, salt, 32).toString("hex") };
    return { created: true };
  }
  const ok = timingSafeEqual(Buffer.from(rec.hash, "hex"), scryptSync(pin, rec.salt, 32));
  return ok ? {} : { error: "PIN incorreto" };
}
