import { render, screen, act } from '@testing-library/react';
import App from '../App';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FullToastProvider } from '../contexts/ToastContext';

// Mock services and hooks
vi.mock('../db/db', () => ({
  db: {
    settings: { get: vi.fn().mockResolvedValue({ theme: 'light', nostrPubKey: null }) }, // Ensure settings mock provides defaults
    notes: { get: vi.fn(), count: vi.fn().mockResolvedValue(0), orderBy: vi.fn().mockReturnThis(), reverse: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]), hook: vi.fn().mockReturnThis() },
    nostrProfiles: { get: vi.fn(), count: vi.fn().mockResolvedValue(0), orderBy: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]), hook: vi.fn().mockReturnThis() },
    tagPages: { get: vi.fn(), count: vi.fn().mockResolvedValue(0), orderBy: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]), hook: vi.fn().mockReturnThis() },
    directMessages: { get: vi.fn(), count: vi.fn().mockResolvedValue(0), orderBy: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([]), hook: vi.fn().mockReturnThis() },
    // Add other tables if App.tsx or its imports interact with them during setup
  },
  // Add other exports from db.ts if necessary (e.g., specific error classes if used)
}));

vi.mock('dexie-react-hooks', () => ({
  useLiveQuery: vi.fn(),
}));

vi.mock('../services/noteService', () => ({
  createNote: vi.fn(),
  getNoteById: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  getAllNotes: vi.fn(() => []), // Return empty array by default
  searchNotes: vi.fn(() => []), // Return empty array by default
  getNotesByTagPageId: vi.fn(() => []), // Return empty array by default
  getAllTags: vi.fn(() => ({ subscribe: () => ({ unsubscribe: () => {} }) })), // Mock Observable
}));

vi.mock('../services/nostrProfileService', () => ({
  createOrUpdateProfileNote: vi.fn(),
  getProfileNoteByNpub: vi.fn(),
  getProfileNoteById: vi.fn(),
  getAllProfileNotes: vi.fn(() => []), // Return empty array by default
  searchProfiles: vi.fn(() => []), // Return empty array by default
  deleteProfileNoteById: vi.fn(),
  fetchProfileFromRelays: vi.fn(),
  verifyNip05: vi.fn(),
  resolveNip05ToNpub: vi.fn(),
  NOSTR_PROFILE_TAG_NAME: 'nostrProfile',
}));

vi.mock('../services/nostrService', () => ({
  npubToHex: vi.fn(),
  hexToNpub: vi.fn(),
  pubKeyToNpub: vi.fn(),
  fetchKind3ContactListEvent: vi.fn(),
  ensureRelayPoolConnected: vi.fn().mockResolvedValue(true),
  // Add any other functions from nostrService that App.tsx might call directly
}));

vi.mock('../services/settingsService', () => ({
  getSettings: vi.fn().mockReturnValue({ theme: 'light', nostrPubKey: null }), // Default settings
  updateSettings: vi.fn(),
}));

vi.mock('../services/tagPageService', () => ({
  getTagPageByName: vi.fn(),
  getAllTagPagesWithItemCounts: vi.fn(() => ({ subscribe: () => ({ unsubscribe: () => {} }) })), // Mock Observable
  // Add other functions if App.tsx calls them directly
}));

// Mock react-hotkeys-hook
vi.mock('react-hotkeys-hook', () => ({
  useHotkeys: vi.fn(),
}));

// Mock child components that are complex or have their own side effects
vi.mock('../components/AppLayout', () => ({
  __esModule: true,
  default: vi.fn(({ mainContent }) => (
    <div>
      Mocked AppLayout
      {/* Render some identifiable part of mainContent if needed for tests */}
    </div>
  )),
}));

vi.mock('../components/AddNostrContactModal', () => ({
  __esModule: true,
  default: vi.fn(() => <div>Mocked AddNostrContactModal</div>),
}));

vi.mock('../components/CommandPalette', () => ({
  __esModule: true,
  default: vi.fn(() => <div>Mocked CommandPalette</div>),
}));


describe('App Component', () => {
  beforeEach(async () => {
    // Reset mocks before each test
    vi.clearAllMocks();

    // Provide default implementations for useLiveQuery for App.tsx
    const { useLiveQuery } = await import('dexie-react-hooks');
    (useLiveQuery as ReturnType<typeof vi.fn>)
      .mockImplementation((querier: any, deps?: any[], defaultResult?: any) => {
        if (querier.name === 'getAllTagPagesWithItemCounts') return defaultResult || [];
        if (querier.name === 'searchNotes' || querier.name === 'getNotesByTagPageId') return defaultResult || [];
        if (querier.name === 'getAllProfileNotes' || querier.name === 'searchProfiles') return defaultResult || [];
        if (querier.name === 'getSettings') return defaultResult || { theme: 'light', nostrPubKey: null };
        return defaultResult || [];
      });

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(), // deprecated
        removeListener: vi.fn(), // deprecated
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
    // Mock localStorage
    const localStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; }
      };
    })();
    Object.defineProperty(window, 'localStorage', { value: localStorageMock });
    // Mock sessionStorage
     const sessionStorageMock = (() => {
      let store: Record<string, string> = {};
      return {
        getItem: (key: string) => store[key] || null,
        setItem: (key: string, value: string) => { store[key] = value.toString(); },
        removeItem: (key: string) => { delete store[key]; },
        clear: () => { store = {}; }
      };
    })();
    Object.defineProperty(window, 'sessionStorage', { value: sessionStorageMock });
  });

  it('renders without crashing', async () => {
    await act(async () => {
      render(
        <FullToastProvider>
          <App />
        </FullToastProvider>
      );
    });
    // Check for a high-level element rendered by App or its direct children (mocked or real)
    // Since AppLayout is mocked, we can check for its mock content.
    expect(screen.getByText('Mocked AppLayout')).toBeInTheDocument();
  });

  // Add more tests here as needed, e.g., for theme toggling, command palette opening
  // These will be more complex due to the heavy mocking.
});
