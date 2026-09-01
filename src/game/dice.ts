import type { DiceRoll, PendingDiceBuff } from "./types";

export function parseNotation(notation: string): { count: number; sides: number; modifier: number } {
  const n = notation.trim().toLowerCase().replace(/\s+/g, "");
  const m = n.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (!m) throw new Error("Could not parse dice notation: " + notation);
  return { count: m[1] ? parseInt(m[1], 10) : 1, sides: parseInt(m[2], 10), modifier: m[3] ? parseInt(m[3], 10) : 0 };
}

function rollDie(sides: number): number {
  return 1 + Math.floor(Math.random() * sides);
}

export function rollDice(notation: string, label: string | undefined, buff: PendingDiceBuff | null): DiceRoll {
  const parsed = parseNotation(notation);
  let count = parsed.count;
  const sides = parsed.sides;
  let modifier = parsed.modifier + (buff?.plus ?? 0);
  const advantage = Boolean(buff?.advantage) && sides === 20 && count === 1;
  if (advantage) count = 2;
  const results: number[] = [];
  for (let i = 0; i < count; i++) results.push(rollDie(sides));
  let used = results;
  if (advantage) used = [Math.max(results[0], results[1])];
  let total = used.reduce((a, b) => a + b, 0) + modifier;
  let nat20 = sides === 20 && used.some((r) => r === 20);
  if (buff?.forceNat20 && sides === 20) {
    used = [20];
    results.length = 0;
    results.push(20);
    total = 20 + modifier;
    nat20 = true;
  }
  return { id: "roll-" + Date.now() + "-" + Math.random().toString(16).slice(2), notation, results, total, modifier, advantage, nat20, label, at: Date.now() };
}
