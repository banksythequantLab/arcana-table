import { actions } from "./actions";
import { decideFirstApproval, getState, resetState } from "./store";

let registered: string[] = [];

export function setRegisteredTools(names: string[]): void {
  registered = names;
}

export function getRegisteredTools(): string[] {
  return registered.slice();
}

export function exposeTestApi(): void {
  window.__ARCANA__ = {
    getState,
    reset: resetState,
    actions: actions as unknown as Record<string, (...args: never[]) => unknown>,
    registeredTools: getRegisteredTools,
    setRegisteredTools,
    allowPending: () => decideFirstApproval("allow"),
    denyPending: () => decideFirstApproval("deny"),
    tickRep: actions.tickRep,
  };
}
