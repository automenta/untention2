// __mocks__/nostr-tools/pure.ts
import { vi } from 'vitest';

// Attempt to get the actual module. Path might need adjustment.
// This is often the hardest part of manual mocks.
// It's better if we can import specific things and re-export.
let actualNip19, actualNip04, actualGetPublicKey, actualFinalizeEvent;

try {
  const actualModule = await vi.importActual('nostr-tools/pure');
  actualNip19 = actualModule.nip19;
  actualNip04 = actualModule.nip04;
  actualGetPublicKey = actualModule.getPublicKey;
  actualFinalizeEvent = actualModule.finalizeEvent;
} catch (e) {
  console.error("Failed to importActual('nostr-tools/pure') in manual mock:", e);
  // Fallback if needed, though tests will likely fail if these are undefined
  actualNip19 = { decode: () => {}, npubEncode: () => {} }; // Basic fallback
}


export const nip19 = actualNip19;
export const nip04 = actualNip04;
export const getPublicKey = actualGetPublicKey;
export const finalizeEvent = actualFinalizeEvent;
// Add any other named exports from nostr-tools/pure that nostrService.ts might use.

export const SimplePool = vi.fn(() => ({
  publish: vi.fn().mockResolvedValue(null),
  list: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(null),
  subscribeMany: vi.fn().mockReturnValue({ unsub: vi.fn() }),
  ensureRelay: vi.fn().mockResolvedValue(undefined),
  close: vi.fn(),
}));

// Log to confirm mock is loaded
// console.log('MANUAL MOCK: nostr-tools/pure loaded');
