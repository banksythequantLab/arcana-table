import type { Room, SceneId, Token } from "./types";

export const GRID_W = 24;
export const GRID_H = 16;

function cellKey(x: number, y: number): string {
  return x + "," + y;
}

function rectCells(x: number, y: number, w: number, h: number): string[] {
  const out: string[] = [];
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) out.push(cellKey(xx, yy));
  return out;
}

function wallRect(x: number, y: number, w: number, h: number, doors: string[] = []): string[] {
  const door = new Set(doors);
  const out: string[] = [];
  for (let xx = x; xx < x + w; xx++) {
    const top = cellKey(xx, y);
    const bot = cellKey(xx, y + h - 1);
    if (!door.has(top)) out.push(top);
    if (!door.has(bot)) out.push(bot);
  }
  for (let yy = y + 1; yy < y + h - 1; yy++) {
    const left = cellKey(x, yy);
    const right = cellKey(x + w - 1, yy);
    if (!door.has(left)) out.push(left);
    if (!door.has(right)) out.push(right);
  }
  return out;
}

export interface SceneDef {
  id: SceneId;
  title: string;
  flavor: string;
  rooms: Room[];
  walls: string[];
  revealed: string[];
  extras: Omit<Token, "id">[];
}

export const SCENES: Record<SceneId, SceneDef> = {
  village: {
    id: "village",
    title: "Emberfall Village",
    flavor: "Lanterns swing over muddy streets. The tavern door is open. Something in the crypt below the chapel has been whispering.",
    rooms: [
      { id: "green", name: "Village Green", x: 1, y: 1, w: 10, h: 8 },
      { id: "tavern", name: "The Gilded Mug", x: 12, y: 1, w: 8, h: 6 },
      { id: "chapel", name: "Chapel Yard", x: 12, y: 8, w: 10, h: 6 },
    ],
    walls: [],
    revealed: rectCells(0, 0, GRID_W, GRID_H),
    extras: [
      { name: "Mira the Innkeep", kind: "npc", x: 14, y: 3, hp: 8, maxHp: 8, ac: 10, conditions: [] },
    ],
  },
  crypt: {
    id: "crypt",
    title: "Chapel Crypt",
    flavor: "Ten minutes. One torch. The stone swallows the village noise. Fog of war hides the burial chambers — and whatever nested in the vault.",
    rooms: [
      { id: "entrance", name: "Crypt Stairs", x: 1, y: 10, w: 6, h: 5 },
      { id: "hall", name: "Ossuary Hall", x: 7, y: 10, w: 8, h: 5 },
      { id: "burials", name: "Burial Nave", x: 1, y: 1, w: 10, h: 8 },
      { id: "vault", name: "Sealed Vault", x: 14, y: 1, w: 9, h: 10 },
    ],
    walls: [
      ...wallRect(1, 10, 6, 5, ["6,12"]),
      ...wallRect(7, 10, 8, 5, ["7,12", "10,10"]),
      ...wallRect(1, 1, 10, 8, ["10,7", "6,8"]),
      ...wallRect(14, 1, 9, 10, ["14,6"]),
    ],
    revealed: rectCells(1, 10, 6, 5),
    extras: [
      { name: "Bone Crawler", kind: "monster", x: 4, y: 4, hp: 13, maxHp: 13, ac: 13, conditions: [] },
      { name: "Bone Crawler", kind: "monster", x: 8, y: 3, hp: 13, maxHp: 13, ac: 13, conditions: [] },
    ],
  },
  "dragon-lair": {
    id: "dragon-lair",
    title: "Ember Vault",
    flavor: "Heat rolls off blackened gold. An ember wyrm coils in the dark, waiting for a hero who brought muscle as well as steel.",
    rooms: [
      { id: "approach", name: "Scorched Approach", x: 1, y: 10, w: 22, h: 5 },
      { id: "hoard", name: "Hoard Cavern", x: 3, y: 1, w: 18, h: 9 },
    ],
    walls: [...wallRect(3, 1, 18, 9, ["11,9"])],
    revealed: rectCells(1, 10, 22, 5),
    extras: [
      { name: "Ember Wyrm", kind: "dragon", x: 12, y: 4, hp: 68, maxHp: 68, ac: 17, conditions: [] },
    ],
  },
};

export function heroStart(scene: SceneId): { x: number; y: number } {
  if (scene === "village") return { x: 3, y: 6 };
  if (scene === "dragon-lair") return { x: 11, y: 12 };
  return { x: 3, y: 12 };
}

export function cellKeyOf(x: number, y: number): string {
  return x + "," + y;
}

export function isRevealed(revealed: string[], x: number, y: number): boolean {
  return revealed.includes(cellKeyOf(x, y));
}
