import { GRID_H, GRID_W, SCENES, heroStart } from "./scenes";
import type { GameState, Token } from "./types";
import { uid } from "./ids";

export const STORAGE_KEY = "arcana-table-v1";

export function createInitialState(): GameState {
  const scene = SCENES.crypt;
  const start = heroStart("crypt");
  const hero: Token = {
    id: "hero-rowan",
    name: "Rowan Emberstride",
    kind: "hero",
    x: start.x,
    y: start.y,
    hp: 28,
    maxHp: 28,
    ac: 16,
    conditions: [],
  };
  const extras: Token[] = scene.extras.map((t) => ({ ...t, id: uid(t.kind) }));
  return {
    scene: "crypt",
    gridWidth: GRID_W,
    gridHeight: GRID_H,
    tokens: [hero, ...extras],
    revealed: [...scene.revealed],
    rooms: scene.rooms,
    walls: [...scene.walls],
    heroId: hero.id,
    sheet: {
      name: "Rowan Emberstride",
      klass: "Fighter",
      level: 3,
      hp: 28,
      maxHp: 28,
      ac: 16,
      attackBonus: 5,
      attackDamage: "1d8+3",
      skills: { Athletics: 5, Perception: 3, Stealth: 1, Insight: 2, Intimidation: 3 },
      inventory: ["Torch", "Longsword", "Travel rations"],
    },
    combat: { active: false, order: [], index: 0, round: 0 },
    story: [{
      id: uid("story"),
      speaker: "dm",
      at: Date.now(),
      text: "The chapel stones sweat in the torchlight. Ten minutes of dungeon lie ahead. A sealed vault waits in the fog — and something large enough to be a dragon can be spawned there.",
    }],
    agentLog: [],
    fitness: [],
    diceHistory: [],
    lastRoll: null,
    challenge: null,
    pendingBuff: null,
    pendingApprovals: [],
    lootAwarded: [],
    sparksUntil: 0,
  };
}
