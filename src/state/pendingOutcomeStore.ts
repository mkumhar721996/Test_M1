import type { SpinResult } from '../engine/engineClient';

const STORAGE_KEY = 'engine-pending-outcome';

export function savePendingOutcome(result: SpinResult): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(result));
}

export function loadPendingOutcome(): SpinResult | null {
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  return JSON.parse(raw) as SpinResult;
}

export function clearPendingOutcome(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
