// ── Arcana Table · game state ────────────────────────────────────────────────
// Single source of truth. Mutations happen ONLY through actions.js.
// Persists to localStorage so a refresh doesn't lose the session.

export const MAPS = {
  dungeon: {
    name: 'The Sunken Keep',
    // legend: # wall · . floor · , rubble · ~ water · D door · L lava
    rows: [
      '######################',
      '#....#.........#.....#',
      '#....D.........D.....#',
      '#....#....,....#.....#',
      '######....,....###D###',
      '#..........,.........#',
      '#...~~..........,....#',
      '#...~~~....###.......#',
      '#....~~....#.#...,...#',
      '#..........#D#.......#',
      '#....,.....#.#....~~.#',
      '#..........#.#...~~~.#',
      '#....#..,..#.#.......#',
      '######################',
    ],
  },
  forest: {
    name: 'The Whispering Glade',
    rows: [
      '######.......#########',
      '##.......,.......#####',
      '#....................#',
      '#..##......~~~....##.#',
      '#..##.....~~~~~....#.#',
      '#..........~~........#',
      '#.....,..............#',
      '#............,....##.#',
      '#..##.............##.#',
      '#..###....,..........#',
      '#..................###',
      '#.....##......,...###.',
      '##....##..........##..',
      '######....#######.....',
    ],
  },
  crypt: {
    name: 'The Ember Crypt',
    rows: [
      '######################',
      '#.....#........#.....#',
      '#..,..#...LL...#..,..#',
      '#.....D..LLLL..D.....#',
      '#.....#...LL...#.....#',
      '###D###........###D###',
      '#..........,.........#',
      '#...,....######......#',
      '#........#....#...,..#',
      '#........D....#......#',
      '#..,.....#....#......#',
      '#........######....,.#',
      '#....................#',
      '######################',
    ],
  },
};

export const GRID_W = 22;
export const GRID_H = 14;

const STORAGE_KEY = 'arcana-table-v1';

function freshState() {
  return {
    scene: { mapId: 'dungeon', title: 'The Sunken Keep', mood: 'Torchlight flickers over wet stone…' },
    tokens: [
      { id: 'pc-brannok', name: 'Brannok', kind: 'pc', art: 'knight', x: 2, y: 2, hp: 24, maxHp: 24, ac: 17, str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 13, conditions: [], inventory: ['Longsword', 'Shield', 'Torch ×3'] },
      { id: 'pc-wren', name: 'Wren', kind: 'pc', art: 'wizard', x: 3, y: 3, hp: 14, maxHp: 14, ac: 12, str: 8, dex: 14, con: 12, int: 17, wis: 13, cha: 10, conditions: [], inventory: ['Spellbook', 'Dagger', 'Component pouch'] },
      { id: 'npc-chest', name: 'Old Chest', kind: 'object', art: 'chest', x: 18, y: 11, hp: 10, maxHp: 10, conditions: [], inventory: [] },
    ],
    revealed: [],                 // ['x,y', …] cells cleared of fog
    combat: { active: false, order: [], turnIndex: 0, round: 1 },
    log: [],                      // story log entries {t, type, actor, text}
    agentLog: [],                 // tool-call entries {t, tool, args, status, note}
    party: { gold: 0, loot: [] },
    dice: null,                   // last roll result
    boosts: { bonus: 0, advantage: false, setRoll: null },  // earned via Heroic Effort
    challenge: null,              // active exercise challenge
    fitness: { totalReps: 0, byExercise: {}, challengesDone: 0, diceEarned: [] },
    settings: { autoApprove: false, exercisePool: ['push-ups', 'crunches', 'jumping jacks', 'squats'] },
  };
}

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.tokens && s.scene) return { ...freshState(), ...s, challenge: null };
    }
  } catch (e) { /* private mode / corrupt save — start fresh */ }
  return freshState();
}

export function save() {
  try {
    const { challenge, ...rest } = state;   // never persist a live challenge
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch (e) { /* best-effort */ }
}

export function resetState() {
  state = freshState();
  save();
}

// ── helpers ──────────────────────────────────────────────────────────────────
export function findToken(idOrName) {
  if (!idOrName) return null;
  const q = String(idOrName).toLowerCase();
  return state.tokens.find(t => t.id.toLowerCase() === q)
      || state.tokens.find(t => t.name.toLowerCase() === q)
      || state.tokens.find(t => t.name.toLowerCase().includes(q))
      || null;
}

export function currentMap() {
  return MAPS[state.scene.mapId] || MAPS.dungeon;
}

export function tileAt(x, y) {
  const rows = currentMap().rows;
  if (y < 0 || y >= rows.length || x < 0 || x >= rows[0].length) return '#';
  return rows[y][x];
}

export function isWalkable(x, y) {
  const t = tileAt(x, y);
  return t === '.' || t === ',' || t === 'D';
}

export function isRevealed(x, y) {
  return state.revealed.includes(`${x},${y}`);
}
