import { useSyncExternalStore } from "react";
import { createInitialState, STORAGE_KEY } from "./initialState";
import type { GameState, PendingApproval } from "./types";

type Listener = () => void;

let state: GameState = loadState();
const listeners = new Set<Listener>();
const approvalWaiters = new Map<string, (decision: "allow" | "deny") => void>();

function loadState(): GameState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialState();
    const parsed = JSON.parse(raw) as GameState;
    if (!parsed || !parsed.heroId || !parsed.tokens) return createInitialState();
    parsed.pendingApprovals = [];
    return parsed;
  } catch {
    return createInitialState();
  }
}

function emit(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore quota */
  }
  listeners.forEach((l) => l());
}

export function getState(): GameState {
  return state;
}

export function setState(updater: (s: GameState) => GameState): GameState {
  state = updater(state);
  emit();
  return state;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function useGameState(): GameState {
  return useSyncExternalStore(subscribe, getState, getState);
}

export function resetState(): GameState {
  for (const [, resolve] of approvalWaiters) resolve("deny");
  approvalWaiters.clear();
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  state = createInitialState();
  emit();
  return state;
}

export function requestApproval(tool: string, summary: string, payload: unknown): Promise<"allow" | "deny"> {
  const id = "appr-" + Math.random().toString(16).slice(2);
  const pending: PendingApproval = { id, tool, summary, payload };
  return new Promise((resolve) => {
    approvalWaiters.set(id, resolve);
    setState((s) => ({ ...s, pendingApprovals: [...s.pendingApprovals, pending] }));
  });
}

export function decideApproval(id: string, decision: "allow" | "deny"): void {
  const waiter = approvalWaiters.get(id);
  approvalWaiters.delete(id);
  setState((s) => ({ ...s, pendingApprovals: s.pendingApprovals.filter((p) => p.id !== id) }));
  if (waiter) waiter(decision);
}

export function decideFirstApproval(decision: "allow" | "deny"): void {
  const first = state.pendingApprovals[0];
  if (first) decideApproval(first.id, decision);
}
