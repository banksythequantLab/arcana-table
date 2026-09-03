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

// ── the quest ────────────────────────────────────────────────────────────────
// Five beats across the three maps. The DM is handed this in every turn's
// context and told to drive toward the current objective, so a session has a
// destination instead of wandering pleasantly forever.
export const QUEST = {
  name: 'The Ember Crown',
  premise: 'The Cinder Wight has taken the Ember Crown into the crypt beneath the Sunken Keep. While it wears the Crown the marshes burn. Take it back.',
  beats: [
    {
      id: 'breach', mapId: 'dungeon', title: 'Breach the flooded hall',
      objective: 'Get the party through the flooded entry hall of the Sunken Keep. Something drowned guards it — fight or outwit it.',
      reward: { items: ['Keep Warden\'s Key'], gold: 40 },
      boon: 'bonus+3',
      honorific: 'Keep-Breakers',
    },
    {
      id: 'vault', mapId: 'dungeon', title: 'Open the drowned vault',
      objective: 'The old chest in the far chamber is the Warden\'s vault. Reach it, open it, survive what is guarding it.',
      reward: { items: ['Emberward Charm', 'Flask of Deep Water'], gold: 90 },
      boon: 'bonus+5',
      honorific: 'Vaultwise',
    },
    {
      id: 'glade', mapId: 'forest', title: 'Cross the Whispering Glade',
      objective: 'The road to the crypt runs through the glade. It is watched. Get the party to the far side.',
      reward: { items: ['Glade-Sung Arrow', 'Whispering Cloak'], gold: 140 },
      boon: 'advantage',
      honorific: 'Glade-Walkers',
    },
    {
      id: 'warden', mapId: 'forest', title: 'Break the Warden\'s ring',
      objective: 'A standing ring of stone wardens bars the crypt door. Beat the one that wakes.',
      reward: { items: ['Crypt Door Sigil', 'Warden\'s Broken Crown'], gold: 220 },
      boon: 'bonus+8',
      honorific: 'Warden-Breakers',
      elite: true,
      spawn: { name: 'The Waking Warden', art: 'warden', hp: 34, x: 11, y: 5 },
    },
    {
      id: 'crown', mapId: 'crypt', title: 'Take back the Ember Crown',
      objective: 'The Cinder Wight waits in the Ember Crypt wearing the Crown. This is the last fight of the run. Make it hurt.',
      reward: { items: ['The Ember Crown', 'Cinderheart Ember'], gold: 500 },
      boon: 'nat20',
      honorific: 'Crown-Takers',
      boss: { name: 'The Cinder Wight', art: 'wight', hp: 60, x: 11, y: 3, scale: 2 },
    },
  ],
};

// ── reach and range ──────────────────────────────────────────────────────────
// A sword does not hit across a room. Every combatant carries a melee reach (in
// squares, diagonals counting as one) and a ranged/spell range; 0 means it has
// no attack of that sort. This is what stops the DM narrating Brannok swinging
// at something eight squares away in the dark — the tool refuses and tells it
// where to stand instead.
export const REACH = {
  knight:   { reach: 1, range: 0 },   // longsword
  wizard:   { reach: 1, range: 8 },   // dagger in hand, spells well past a bowshot
  villager: { reach: 1, range: 0 },
  goblin:   { reach: 1, range: 4 },   // shortbow
  skeleton: { reach: 1, range: 0 },
  wolf:     { reach: 1, range: 0 },
  dragon:   { reach: 2, range: 5 },   // long neck, longer breath
  ooze:     { reach: 1, range: 0 },   // it has to touch you
  spider:   { reach: 1, range: 5 },   // web, from the ceiling
  wraith:   { reach: 1, range: 6 },   // cold at a distance
  ogre:     { reach: 2, range: 3 },   // long arms, and it throws things
  rat:      { reach: 1, range: 0 },
  warden:   { reach: 2, range: 0 },   // stone arms, no ranged attack
  wight:    { reach: 2, range: 6 },   // the Crown burns at a distance
  chest:    { reach: 0, range: 0 },
};
export const DEFAULT_REACH = { reach: 1, range: 0 };

/** Grid distance, diagonals counting as one square. */
export function gridDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

// A downed hero freezes the board. Three failed death saves ends the run —
// but reps buy a failure back, so effort is always a way out.
export const DEATH_SAVE_DC = 10;
export const DEATH_SAVE_FAILS = 3;

// ── the warm-up ──────────────────────────────────────────────────────────────
// Twenty standing stretches, head to ankle. Nothing needs a mat and nothing
// needs the floor. Every entry carries a cue (what to do) and a note (why, or
// what to watch), because a timer with no coaching is just a countdown.
export const STRETCHES = [
  { name: 'Neck rolls',            cue: 'Chin to chest. Roll slowly, ear toward each shoulder.', note: 'Small circles. Never roll back through the neck.' },
  { name: 'Neck hold · left',      cue: 'Left ear toward left shoulder. Let the arm hang.',      note: 'Breathe into the stretch, do not pull.' },
  { name: 'Neck hold · right',     cue: 'Right ear toward right shoulder. Shoulders down.',      note: 'Same weight both sides.' },
  { name: 'Shoulder rolls',        cue: 'Big slow circles backward. Make them bigger.',          note: 'Chest opens a little more each one.' },
  { name: 'Cross-body · left',     cue: 'Left arm across the chest. Hug it in with the right.',  note: 'Keep the left shoulder pressed down.' },
  { name: 'Cross-body · right',    cue: 'Right arm across. Same hold, other side.',              note: 'Shoulder down, not up by your ear.' },
  { name: 'Triceps · left',        cue: 'Left hand behind your head, gently press the elbow.',   note: 'Stand tall. Do not arch the back.' },
  { name: 'Triceps · right',       cue: 'Switch. Right elbow this time.',                        note: 'Ribs stay down.' },
  { name: 'Chest opener',          cue: 'Hands clasped behind your back. Lift and open.',        note: 'This is the one that undoes a desk.' },
  { name: 'Side bend · left',      cue: 'Right arm overhead, lean left. Reach long.',            note: 'Lengthen, do not collapse sideways.' },
  { name: 'Side bend · right',     cue: 'Left arm overhead, lean right.',                        note: 'Feel it down the whole flank.' },
  { name: 'Standing twist',        cue: 'Feet planted, arms loose. Swing and rotate.',           note: 'Let the arms be heavy ropes.' },
  { name: 'Forward fold',          cue: 'Soft knees. Hinge and hang. Let the head go.',          note: 'Bend the knees as much as you need.' },
  { name: 'Quad · left',           cue: 'Left heel to glute. Hold a wall if you need one.',      note: 'Knees together, hips forward.' },
  { name: 'Quad · right',          cue: 'Right heel to glute. Stand tall.',                      note: 'No leaning forward.' },
  { name: 'Hamstring · left',      cue: 'Left heel forward, toes up. Hinge over it.',            note: 'Back stays flat, chest proud.' },
  { name: 'Hamstring · right',     cue: 'Right heel forward. Same hinge.',                       note: 'Stop where you feel it, not where it hurts.' },
  { name: 'Calf · left',           cue: 'Left foot back, heel down, press the hips forward.',    note: 'Back leg straight.' },
  { name: 'Calf · right',          cue: 'Right foot back. Heel pinned to the floor.',            note: 'Both feet pointing forward.' },
  { name: 'Ankles + shake out',    cue: 'Circle each ankle, then shake everything loose.',       note: 'You are warm. That is the point.' },
];

// The same twenty stretches, but a short plan SPANS the body rather than
// slicing the top off the list. Taking the first six gave three consecutive
// neck holds and never reached the legs, which is not a warm-up — it is a neck
// routine. Each plan below walks head to ankle in whatever time there is, and
// left/right stretches are always kept together so no side is left cold.
export const WARMUP_PLANS = {
  '90s':  { label: '90 seconds', hold: 15,
            seq: [0, 3, 11, 12, 13, 14] },                 // neck · shoulders · twist · fold · quads
  '3min': { label: '3 minutes',  hold: 15,
            seq: [0, 3, 4, 5, 8, 9, 10, 11, 12, 13, 14, 19] },
  '5min': { label: '5 minutes',  hold: 15, seq: null },    // null = all twenty, in order
  '10min':{ label: '10 minutes', hold: 30, seq: null },
};

/** The stretch indices a plan actually runs, head to ankle. */
export function warmupSeq(plan) {
  const p = WARMUP_PLANS[plan];
  return p?.seq ? p.seq.slice() : STRETCHES.map((_, i) => i);
}

// Oaths a DM can reach for when a player would rather spend effort than sweat.
export const OATH_KINDS = ['chores', 'study', 'reading', 'practice', 'admin', 'tidy'];

// Not everyone can pay in push-ups, and not everyone wants to. The table takes
// three currencies and this is the player's standing answer on which of them it
// may ask for. It is enforced in the tools rather than described in the prompt,
// because a preference the DM merely knows about is one it forgets by turn six.
export const EFFORT_PREFS = {
  any:   { label: 'Anything',   hint: 'reps, holds and Oaths',                   modes: ['reps', 'hold'], oaths: true },
  reps:  { label: 'Reps',       hint: 'push-ups, squats — counted',              modes: ['reps'],         oaths: false },
  holds: { label: 'Holds',      hint: 'planks, wall sits — timed',               modes: ['hold'],         oaths: false },
  oaths: { label: 'Oaths only', hint: 'chores, study, reading — nothing physical', modes: [],             oaths: true },
};

const STORAGE_KEY = 'arcana-table-v1';

function freshState() {
  return {
    scene: { mapId: 'dungeon', title: 'The Sunken Keep', mood: 'Torchlight flickers over wet stone…' },
    tokens: [
      { id: 'pc-brannok', name: 'Brannok', kind: 'pc', art: 'knight', x: 2, y: 2, hp: 24, maxHp: 24, ac: 17, str: 16, dex: 10, con: 14, int: 8, wis: 12, cha: 13, reach: 1, range: 0, conditions: [], inventory: ['Longsword', 'Shield', 'Torch ×3'] },
      { id: 'pc-mira', name: 'Mira', kind: 'pc', art: 'wizard', x: 3, y: 3, hp: 14, maxHp: 14, ac: 12, str: 8, dex: 14, con: 12, int: 17, wis: 13, cha: 10, reach: 1, range: 8, spells: ['Fireball', 'Frostbite', 'Mage Hand'], conditions: [], inventory: ['Spellbook', 'Dagger', 'Component pouch'] },
      { id: 'npc-chest', name: 'Old Chest', kind: 'object', art: 'chest', x: 18, y: 11, hp: 10, maxHp: 10, reach: 0, range: 0, conditions: [], inventory: [] },
    ],
    revealed: [],                 // ['x,y', …] cells cleared of fog
    combat: { active: false, order: [], turnIndex: 0, round: 1 },
    log: [],                      // story log entries {t, type, actor, text}
    agentLog: [],                 // tool-call entries {t, tool, args, status, note}
    party: { gold: 0, loot: [], level: 1 },   // the party levels on every cleared beat
    dice: null,                   // last roll result
    spellFx: null,                // {x, y, kind, t} — the board paints the burst
    milestone: null,              // {t, title, items, gold, boon} — the beat-cleared banner
    boosts: { bonus: 0, advantage: false, setRoll: null },  // earned via Heroic Effort
    challenge: null,              // active exercise challenge
    fitness: {
      totalReps: 0, byExercise: {}, challengesDone: 0, diceEarned: [],
      holdSeconds: 0,             // planks, wall sits, stretches
      oathsKept: 0, oathMinutes: 0, oathsBroken: 0,
      warmedUp: false,            // has the player stretched this session
      // Exchanges since the DM last staked something real. The model was
      // leaving eight or ten turns between offers however the prompt was
      // worded, so the count is handed to it explicitly and it is told plainly
      // when it is overdue.
      turnsSinceOffer: 0, offersMade: 0,
    },
    quest: { beatIndex: 0, status: 'active', completed: [], startedAt: Date.now() },
    downed: null,                 // {tokenId, saves, fails} — the board is frozen while this is set
    warmup: null,                 // {planId, index, seq, hold, count, remaining, paused}
    oath: null,                   // {label, kind, minutes, endsAt, reward} — the table waits
    settings: { autoApprove: false,
                effortPref: 'any',        // which of the three currencies the table may ask for
                exercisePool: ['push-ups', 'crunches', 'jumping jacks', 'squats'],
                holdPool: ['plank', 'wall sit', 'squat hold', 'glute bridge'] },
  };
}

export let state = load();

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      // Neither a live challenge nor a running warm-up is a save state: half a
      // set of push-ups means nothing, and a restored warm-up has no interval
      // behind it, so its card would sit frozen on a stretch forever.
      if (s && s.tokens && s.scene) return { ...freshState(), ...s, challenge: null, warmup: null };
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
/** Levenshtein, capped — we only care whether two words are close. */
function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return prev[b.length];
}

// Names arrive by microphone as often as by keyboard, and speech recognition
// does not hand back the spelling you chose — it hands back what it heard.
// An exact-match-only lookup meant a mis-transcribed name simply failed, and
// the DM was left talking about a hero it could not address. So: exact first,
// then substring, then the nearest name within a small edit distance.
export function findToken(idOrName) {
  if (!idOrName) return null;
  const raw = String(idOrName).trim();
  const q = raw.toLowerCase();
  const exact = state.tokens.find(t => t.id.toLowerCase() === q)
             || state.tokens.find(t => t.name.toLowerCase() === q)
             || state.tokens.find(t => t.name.toLowerCase().includes(q))
             || state.tokens.find(t => q.includes(t.name.toLowerCase()));
  if (exact) return exact;

  // Nothing matched outright — find the closest name, if it is close enough.
  // The threshold scales with length so "meera" still finds "Mira" but "orc"
  // does not become "ooze".
  let best = null, bestD = Infinity;
  for (const t of state.tokens) {
    const n = t.name.toLowerCase();
    const d = Math.min(editDistance(q, n), ...n.split(/\s+/).map(w => editDistance(q, w)));
    if (d < bestD) { bestD = d; best = t; }
  }
  const limit = q.length <= 4 ? 1 : q.length <= 7 ? 2 : 3;
  return bestD <= limit ? best : null;
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
