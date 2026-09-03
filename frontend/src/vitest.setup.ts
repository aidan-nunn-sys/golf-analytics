import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';

// Node 22+ defines its own experimental `localStorage` global that stays
// `undefined` unless the process is started with `--localstorage-file`, and it
// shadows the one jsdom installs. Anything touching `localStorage` (the auth
// token in `api/client.ts`) therefore explodes under test on modern Node.
// Install a real in-memory Storage when the global is missing.
class MemoryStorage implements Storage {
  #data = new Map<string, string>();

  get length(): number {
    return this.#data.size;
  }

  clear(): void {
    this.#data.clear();
  }

  getItem(key: string): string | null {
    return this.#data.get(String(key)) ?? null;
  }

  key(index: number): string | null {
    return [...this.#data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.#data.delete(String(key));
  }

  setItem(key: string, value: string): void {
    this.#data.set(String(key), String(value));
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
}

// Cleanup after each test case
afterEach(() => {
  cleanup();
  // Keep token/preference state from leaking between tests.
  localStorage.clear();
});
