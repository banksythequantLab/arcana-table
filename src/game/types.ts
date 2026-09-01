export type SceneId = "village" | "crypt" | "dragon-lair";
export type TokenKind = "hero" | "monster" | "npc" | "dragon" | "loot";
export type Exercise = "jumping-jacks" | "squats" | "burpees";
export type DiceBuffKind = "plus2" | "advantage" | "nat20";
export type ToolStatus = "ok" | "denied" | "error" | "pending";

export interface Token {
  id: string;
  name: string;
  kind: TokenKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  ac: number;
  conditions: string[];
}

export interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CharacterSheet {
  name: string;
  klass: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  attackBonus: number;
  attackDamage: string;
  skills: Record<string, number>;
  inventory: string[];
}

export interface CombatState {
  active: boolean;
  order: string[];
  index: number;
  round: number;
}

export interface DiceRoll {
  id: string;
  notation: string;
  results: number[];
  total: number;
  modifier: number;
  advantage: boolean;
  nat20: boolean;
  label?: string;
  at: number;
}

export interface StoryEntry {
  id: string;
  text: string;
  at: number;
  speaker: "dm" | "system" | "hero";
}

export interface AgentLogEntry {
  id: string;
  tool: string;
  input: unknown;
  result: unknown;
  at: number;
  status: ToolStatus;
}

export interface FitnessEntry {
  id: string;
  exercise: Exercise;
  reps: number;
  reward: DiceBuffKind;
  completed: boolean;
  at: number;
}

export interface HeroicChallenge {
  id: string;
  exercise: Exercise;
  targetReps: number;
  currentReps: number;
  reward: DiceBuffKind;
  seconds: number;
  startedAt: number;
  status: "active" | "completed" | "failed" | "cancelled";
}

export interface PendingApproval {
  id: string;
  tool: string;
  summary: string;
  payload: unknown;
}

export interface PendingDiceBuff {
  plus: number;
  advantage: boolean;
  forceNat20: boolean;
  source: string;
}

export interface ToolResult {
  ok: boolean;
  denied?: boolean;
  guidance?: string;
  error?: string;
  summary: string;
  data?: unknown;
}

export interface GameState {
  scene: SceneId;
  gridWidth: number;
  gridHeight: number;
  tokens: Token[];
  revealed: string[];
  rooms: Room[];
  walls: string[];
  heroId: string;
  sheet: CharacterSheet;
  combat: CombatState;
  story: StoryEntry[];
  agentLog: AgentLogEntry[];
  fitness: FitnessEntry[];
  diceHistory: DiceRoll[];
  lastRoll: DiceRoll | null;
  challenge: HeroicChallenge | null;
  pendingBuff: PendingDiceBuff | null;
  pendingApprovals: PendingApproval[];
  lootAwarded: string[];
  sparksUntil: number;
}
