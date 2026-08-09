/**
 * Tiny localStorage-backed persistence helper used ONLY by the frontend mock
 * layers under `src/features/<feature>/api.ts`.
 *
 * Why this exists: the mock "backends" hold their state in plain in-memory
 * variables, which is enough to satisfy the command contract. Backing them
 * with localStorage on top is a dev-experience nicety so state (the vault
 * being initialized, saved profiles, settings) survives a page reload
 * instead of resetting on every `bun run dev` refresh. It has no equivalent
 * on the real backend (that will persist to SQLite on disk) and every
 * function that touches it lives entirely inside the mock modules - nothing
 * else in the app imports this file directly.
 */

const PREFIX = "rose-lm-mock:";

export function readMockState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeMockState<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore quota/availability errors - mock persistence is best-effort.
  }
}

export function clearMockState(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore.
  }
}

/** Simulates IPC latency so loading states are real, not instant. */
export function mockDelay(ms = 250): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
