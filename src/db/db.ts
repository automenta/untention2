import Dexie, { Table } from 'dexie';

export interface Note {
  id?: number;
  title: string;
  content: string;
  tags: string[]; // Store tags as an array of strings
  createdAt: Date;
  updatedAt: Date;
  // For full-text search, Dexie typically indexes all string properties.
  // We can also use multiEntry indexes for tags if needed for specific queries.
}

export interface Settings {
  id?: number; // Singleton settings object, always id 1
  lmModel?: string; // e.g., "gpt-3.5-turbo", "claude-2", "gemini-pro"
  ollamaBaseUrl?: string; // For Ollama, e.g., http://localhost:11434
  nostrRelayUrl?: string;
  nostrPubKey?: string;
  theme: 'light' | 'dark';

  // Encrypted fields, stored as ArrayBuffer
  encryptedLmApiKey?: ArrayBuffer;
  encryptedNostrPrivKey?: ArrayBuffer;
  // Store salt for key derivation if not fixed, or IVs if needed per encryption
  // For simplicity with fixed salt, not storing IV per item if using AES-GCM with new IV each time (internally generated)
  // However, if we derive a key, we need a salt. Let's add one.
  encryptionSalt?: Uint8Array;
}

export interface LMCacheEntry {
  id?: number; // Auto-incrementing ID
  prompt: string; // The prompt sent to the LM
  response: string; // The full response from the LM
  model: string; // Model used for this response
  timestamp: Date; // When this entry was cached
}

export class NotentionDexie extends Dexie {
  notes!: Table<Note>;
  settings!: Table<Settings>;
  lmCache!: Table<LMCacheEntry>;

  constructor() {
    super('notentionDB');
    this.version(1).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content', // Dexie will FTS 'title' and 'content'
      settings: '++id', // Should only ever have one entry with id: 1
    });
    // Add new table in a new version
    this.version(2).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content',
      settings: '++id',
      lmCache: '++id, prompt, model, timestamp' // Index prompt for potential lookups, timestamp for eviction
    });
  }

  async initializeSettings() {
    const settingsCount = await this.settings.count();
    if (settingsCount === 0) {
      await this.settings.add({
        id: 1,
        theme: 'light', // Default theme
      });
    }
  }
}

export const db = new NotentionDexie();
db.initializeSettings(); // Ensure settings are initialized when db is imported.
