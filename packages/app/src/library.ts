// The user's own creatures, kept in the browser's storage until there's somewhere better to keep them.

const KEY = "genocode.creatures";

function load(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as unknown;
    return stored && typeof stored === "object" ? (stored as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The names of the saved creatures, sorted. */
export function savedNames(): string[] {
  return Object.keys(load()).sort((a, b) => a.localeCompare(b));
}

export function savedText(name: string): string | undefined {
  return load()[name];
}

/** Saves a creature under its name, replacing one saved under the same name. Throws when storage is full or blocked. */
export function saveCreature(name: string, text: string): void {
  const all = load();
  all[name] = text;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function deleteCreature(name: string): void {
  const all = load();
  delete all[name];
  localStorage.setItem(KEY, JSON.stringify(all));
}
