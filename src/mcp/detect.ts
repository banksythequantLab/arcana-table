export type WebMcpMode = "native" | "polyfill" | "missing";

export function getModelContext(): { registerTool: (tool: unknown, opts?: unknown) => unknown } | null {
  const doc = document as unknown as { modelContext?: { registerTool?: unknown } };
  const nav = navigator as unknown as { modelContext?: { registerTool?: unknown } };
  const ctx = doc.modelContext ?? nav.modelContext;
  if (ctx && typeof ctx.registerTool === "function") return ctx as { registerTool: (tool: unknown, opts?: unknown) => unknown };
  return null;
}

export function detectWebMcp(): WebMcpMode {
  const doc = document as unknown as { modelContext?: { isWebMCPPolyfill?: boolean; __isWebMCPPolyfill?: boolean } };
  const nav = navigator as unknown as { modelContext?: unknown };
  const ctx = doc.modelContext ?? nav.modelContext;
  if (!ctx) return "missing";
  const asRec = ctx as { isWebMCPPolyfill?: boolean; __isWebMCPPolyfill?: boolean };
  if (asRec.isWebMCPPolyfill || asRec.__isWebMCPPolyfill) return "polyfill";
  return "native";
}

export const WEBMCP_HINT = "Enable chrome://flags/#enable-webmcp-testing or open this table in the ChatGPT in-app browser so an agent can take the co-DM seat.";
