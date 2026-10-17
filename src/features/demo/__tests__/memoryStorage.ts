export class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  /** Keys whose setItem throws, to simulate quota errors. */
  failOn = new Set<string>();

  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(key: string) { return this.map.has(key) ? this.map.get(key)! : null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(key: string) { this.map.delete(key); }
  setItem(key: string, value: string) {
    if (this.failOn.has(key)) throw new DOMException("quota", "QuotaExceededError");
    this.map.set(key, value);
  }
}

/** Node can shadow jsdom's localStorage; install an in-memory one on window for code that reads it directly. */
const originals = {
  window: Object.getOwnPropertyDescriptor(window, "localStorage"),
  global: Object.getOwnPropertyDescriptor(globalThis, "localStorage"),
};

/** Undo installMemoryLocalStorage; call from afterEach so tests don't leak demo flags. */
export function restoreLocalStorage(): void {
  for (const [target, key] of [[window, "window"], [globalThis, "global"]] as const) {
    const d = originals[key];
    if (d) Object.defineProperty(target, "localStorage", d);
    else delete (target as unknown as Record<string, unknown>).localStorage;
  }
}

export function installMemoryLocalStorage(): MemoryStorage {
  const storage = new MemoryStorage();
  Object.defineProperty(window, "localStorage", { value: storage, writable: true, configurable: true });
  Object.defineProperty(globalThis, "localStorage", { value: storage, writable: true, configurable: true });
  return storage;
}
