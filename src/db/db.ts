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

export interface NostrProfileNote extends Note {
  npub: string; // npub (bech32 encoded public key)
  name?: string; // NIP-01 name
  picture?: string; // NIP-01 picture URL
  about?: string; // NIP-01 about content
  nip05?: string; // NIP-05 identifier
  lastChecked?: Date; // Timestamp of last NIP-01 fetch attempt
  // Other NIP-01 fields like website, lud16, etc., can be added as needed
  // Re-uses title from Note for a local alias/display name
  // Re-uses content from Note for local private notes about the profile
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
  nostrProfiles!: Table<NostrProfileNote>;

  constructor() {
    super('notentionDB');
    this.version(1).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content',
      settings: '++id',
    });
    this.version(2).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content',
      settings: '++id',
      lmCache: '++id, prompt, model, timestamp'
    });
    // Add new nostrProfiles table in a new version
    this.version(3).stores({
      notes: '++id, title, *tags, createdAt, updatedAt, content',
      settings: '++id',
      lmCache: '++id, prompt, model, timestamp',
      nostrProfiles: '++id, npub, name, *tags, createdAt, updatedAt, content, nip05, lastChecked' // Index npub for quick lookup
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
