export function uid(prefix: string): string {
  return prefix + "-" + Math.random().toString(16).slice(2) + Date.now().toString(16);
}
