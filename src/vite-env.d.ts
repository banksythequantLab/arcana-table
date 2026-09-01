/// <reference types="vite/client" />

interface Window {
  __ARCANA__: {
    getState: () => unknown;
    reset: () => void;
    actions: Record<string, (...args: never[]) => unknown>;
    registeredTools: () => string[];
    setRegisteredTools: (names: string[]) => void;
    allowPending: () => void;
    denyPending: () => void;
    tickRep: () => unknown;
  };
}
